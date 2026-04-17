import { RouteAlternative, RouteAlternativeStep, RouteInfo } from './types';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mapLiFiRouteStep(step: any): RouteAlternativeStep {
  const action = step?.action ?? {};
  const estimate = step?.estimate ?? {};

  const includedSteps = Array.isArray(step?.includedSteps) && step.includedSteps.length > 0
    ? step.includedSteps.map((s: any) => mapLiFiRouteStep(s))
    : undefined;

  return {
    type: asString(step?.type),
    tool: asString(step?.tool),
    toolName: asString(step?.toolDetails?.name) || asString(step?.tool),
    fromChainId: asNumber(action?.fromChainId) ?? asNumber(step?.fromChainId),
    toChainId: asNumber(action?.toChainId) ?? asNumber(step?.toChainId),
    fromTokenSymbol: asString(action?.fromToken?.symbol),
    fromTokenDecimals: asNumber(action?.fromToken?.decimals),
    toTokenSymbol: asString(action?.toToken?.symbol),
    toTokenDecimals: asNumber(action?.toToken?.decimals),
    fromAmount: asString(estimate?.fromAmount) || asString(action?.fromAmount),
    toAmount: asString(estimate?.toAmount) || asString(action?.toAmount),
    fromAmountUSD: asString(estimate?.fromAmountUSD),
    toAmountUSD: asString(estimate?.toAmountUSD),
    executionDuration: asNumber(estimate?.executionDuration) ?? asNumber(step?.executionDuration),
    includedSteps
  };
}

export function mapLiFiRouteAlternative(route: any): RouteAlternative {
  const steps = Array.isArray(route?.steps)
    ? route.steps.map((step: any) => mapLiFiRouteStep(step))
    : [];
  const firstStep = steps[0];

  const toolNames: string[] = Array.from(
    new Set(
      steps
        .map((step: RouteAlternativeStep) => step.toolName || step.tool)
        .filter((toolName: string | undefined): toolName is string => Boolean(toolName))
    )
  );

  const executionDuration = steps.reduce(
    (sum: number, step: RouteAlternativeStep) => sum + (step.executionDuration || 0),
    0
  );

  return {
    id: asString(route?.id),
    fromAmount: asString(route?.fromAmount) || firstStep?.fromAmount,
    toAmount: asString(route?.toAmount) || firstStep?.toAmount,
    fromAmountUSD: asString(route?.fromAmountUSD),
    toAmountUSD: asString(route?.toAmountUSD),
    fromTokenSymbol: asString(route?.fromToken?.symbol) || firstStep?.fromTokenSymbol,
    fromTokenDecimals: asNumber(route?.fromToken?.decimals) ?? firstStep?.fromTokenDecimals,
    toTokenSymbol: asString(route?.toToken?.symbol) || firstStep?.toTokenSymbol,
    toTokenDecimals: asNumber(route?.toToken?.decimals) ?? firstStep?.toTokenDecimals,
    gasCostUSD: asString(route?.gasCostUSD),
    toolNames,
    stepCount: steps.length || undefined,
    executionDuration: executionDuration > 0 ? executionDuration : undefined,
    steps
  };
}

export function extractLiFiAlternatives(route?: RouteInfo): RouteAlternative[] {
  if (!route || route.type !== 'lifi') {
    return [];
  }

  if (Array.isArray(route.alternatives) && route.alternatives.length > 0) {
    return route.alternatives;
  }

  if (Array.isArray(route.raw?.routes)) {
    return route.raw.routes.map((item: any) => mapLiFiRouteAlternative(item));
  }

  return [];
}

export function getLiFiPrimaryToolLabel(route?: RouteInfo): string | null {
  if (!route) {
    return null;
  }

  const alternatives = extractLiFiAlternatives(route);
  const primaryTools = alternatives[0]?.toolNames;
  if (primaryTools && primaryTools.length > 0) {
    return primaryTools.join(' / ');
  }

  if (route.selectedTool) {
    return route.selectedTool;
  }

  const raw = route.raw || {};
  return raw.tool || raw.toolDetails?.name || null;
}

'use client';

import { extractLiFiAlternatives, getLiFiPrimaryToolLabel } from '@/lib/lifi-route';
import { RouteAlternative, RouteInfo } from '@/lib/types';

interface ActiveRouteState {
  chain: string;
  source: string;
  routeAtoB?: RouteInfo;
  routeBtoA?: RouteInfo;
}

interface RouteDetailsModalProps {
  activeRoute: ActiveRouteState | null;
  onClose: () => void;
  tokenA: string;
  tokenB: string;
}

function formatUsd(value?: string | number | null): string | null {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return null;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount >= 100 ? 0 : 2
  }).format(amount);
}

function formatDuration(seconds?: number): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }

  const minutes = Math.floor(rounded / 60);
  const remainSeconds = rounded % 60;
  if (minutes < 60) {
    return remainSeconds > 0 ? `${minutes}m ${remainSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
}

function truncateId(value?: string): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function compactHash(value?: string): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatWithGrouping(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatTokenAmount(amount?: string | null, decimals?: number, symbol?: string): string | null {
  if (!amount || decimals === undefined || !Number.isFinite(decimals) || decimals < 0) {
    return null;
  }

  try {
    const negative = amount.startsWith('-');
    const raw = negative ? amount.slice(1) : amount;
    const value = BigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const fraction = value % base;
    const wholeFormatted = formatWithGrouping(whole.toString());
    const fractionRaw = fraction.toString().padStart(decimals, '0');
    const fractionTrimmed = fractionRaw.slice(0, 6).replace(/0+$/, '');
    const formatted = fractionTrimmed.length > 0
      ? `${wholeFormatted}.${fractionTrimmed}`
      : wholeFormatted;

    return `${negative ? '-' : ''}${formatted}${symbol ? ` ${symbol}` : ''}`;
  } catch {
    return null;
  }
}

function formatTokenLabel(token?: string, fallback?: string): string {
  if (fallback) {
    return fallback;
  }

  if (!token) {
    return 'Unknown';
  }

  if (token.startsWith('0x') && token.length >= 12) {
    return compactHash(token) || token;
  }

  return token.toUpperCase();
}

function formatRouteBlocks(route?: RouteInfo): string[] {
  if (!route) return [];
  if (route.note) {
    return [route.note];
  }
  if (Array.isArray(route.swaps)) {
    return [JSON.stringify(route.swaps, null, 2)];
  }
  if (route.raw || route.tx) {
    return [JSON.stringify({ raw: route.raw, tx: route.tx }, null, 2)];
  }
  return [JSON.stringify(route, null, 2)];
}

function renderMetric(label: string, value: string | number | null) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return (
    <div className="rounded-xl bg-white/80 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function LiFiAlternativeCard({ alternative, index }: { alternative: RouteAlternative; index: number }) {
  const title = alternative.toolNames?.join(' / ') || `Route ${index + 1}`;
  const routeId = truncateId(alternative.id);

  return (
    <article
      className={[
        'rounded-2xl border p-4 shadow-sm transition-colors',
        index === 0
          ? 'border-teal-300 bg-gradient-to-br from-teal-50 via-white to-cyan-50'
          : 'border-gray-200 bg-white'
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                index === 0 ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
              ].join(' ')}
            >
              {index === 0 ? 'Best Quote' : `Alt ${index + 1}`}
            </span>
            {(alternative.toolNames || []).map(tool => (
              <span
                key={`${alternative.id || index}-${tool}`}
                className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700"
              >
                {tool}
              </span>
            ))}
          </div>
          <div className="mt-3 text-base font-semibold text-gray-900">{title}</div>
          {routeId && <div className="mt-1 text-xs text-gray-500">Route ID: {routeId}</div>}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {renderMetric('Input', formatTokenAmount(alternative.fromAmount, alternative.fromTokenDecimals, alternative.fromTokenSymbol))}
        {renderMetric('Output', formatTokenAmount(alternative.toAmount, alternative.toTokenDecimals, alternative.toTokenSymbol))}
        {renderMetric('Output USD', formatUsd(alternative.toAmountUSD))}
        {renderMetric('Gas USD', formatUsd(alternative.gasCostUSD))}
        {renderMetric('Steps', alternative.stepCount ?? null)}
        {renderMetric('ETA', formatDuration(alternative.executionDuration))}
      </div>

      {alternative.steps && alternative.steps.length > 0 && (
        <div className="mt-4 space-y-2">
          {alternative.steps.map((step, stepIndex) => {
            const tokenRoute = [step.fromTokenSymbol, step.toTokenSymbol]
              .filter((value): value is string => Boolean(value))
              .join(' -> ');
            const chainRoute = [step.fromChainId, step.toChainId]
              .filter((value): value is number => value !== undefined)
              .join(' -> ');

            return (
              <div key={`${alternative.id || index}-step-${stepIndex}`} className="rounded-xl border border-white/80 bg-white/80 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-800">
                    Step {stepIndex + 1}
                    {step.toolName ? ` · ${step.toolName}` : ''}
                  </div>
                  {step.type && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                      {step.type}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                  {tokenRoute && <span className="rounded-full bg-gray-100 px-2 py-1">{tokenRoute}</span>}
                  {chainRoute && <span className="rounded-full bg-gray-100 px-2 py-1">Chain {chainRoute}</span>}
                  {formatTokenAmount(step.fromAmount, step.fromTokenDecimals, step.fromTokenSymbol) && (
                    <span className="rounded-full bg-gray-100 px-2 py-1">
                      In {formatTokenAmount(step.fromAmount, step.fromTokenDecimals, step.fromTokenSymbol)}
                    </span>
                  )}
                  {formatTokenAmount(step.toAmount, step.toTokenDecimals, step.toTokenSymbol) && (
                    <span className="rounded-full bg-gray-100 px-2 py-1">
                      Out {formatTokenAmount(step.toAmount, step.toTokenDecimals, step.toTokenSymbol)}
                    </span>
                  )}
                  {formatUsd(step.toAmountUSD) && <span className="rounded-full bg-gray-100 px-2 py-1">Out {formatUsd(step.toAmountUSD)}</span>}
                  {formatDuration(step.executionDuration) && <span className="rounded-full bg-gray-100 px-2 py-1">ETA {formatDuration(step.executionDuration)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function RouteDirectionPanel({
  title,
  route,
  fromTokenSymbol,
  toTokenSymbol
}: {
  title: string;
  route?: RouteInfo;
  fromTokenSymbol: string;
  toTokenSymbol: string;
}) {
  if (!route) {
    return null;
  }

  const lifiAlternatives = extractLiFiAlternatives(route);

  if (lifiAlternatives.length > 0) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            <div className="mt-1 text-sm text-gray-500">
              {lifiAlternatives.length > 1
                ? `Li.Fi returned ${lifiAlternatives.length} quote sources`
                : `via Li.Fi · ${getLiFiPrimaryToolLabel(route) || 'unknown tool'}`}
            </div>
          </div>
          {getLiFiPrimaryToolLabel(route) && (
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
              Best source: {getLiFiPrimaryToolLabel(route)}
            </span>
          )}
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {lifiAlternatives.map((alternative, index) => (
            <LiFiAlternativeCard
              key={alternative.id || `${title}-alternative-${index}`}
              alternative={alternative}
              index={index}
            />
          ))}
        </div>
      </section>
    );
  }

  const routeLines = formatRouteBlocks(route);
  if (routeLines.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white/90 p-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <div className="text-base font-semibold text-gray-900">{title}</div>
        {getLiFiPrimaryToolLabel(route) && (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            {getLiFiPrimaryToolLabel(route)}
          </span>
        )}
      </div>
      <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
        {routeLines.join('\n')}
      </pre>
    </section>
  );
}

export default function RouteDetailsModal({ activeRoute, onClose, tokenA, tokenB }: RouteDetailsModalProps) {
  if (!activeRoute) {
    return null;
  }

  const hasRouteInfo = Boolean(activeRoute.routeAtoB || activeRoute.routeBtoA);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-6xl rounded-[28px] border border-white/60 bg-gradient-to-br from-slate-50 via-white to-teal-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">Route Details</div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              {activeRoute.chain} · {activeRoute.source}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-2xl leading-none text-slate-400 transition-colors hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="max-h-[80vh] space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <RouteDirectionPanel
            title={`${tokenA} -> ${tokenB}`}
            route={activeRoute.routeAtoB}
            fromTokenSymbol={tokenA}
            toTokenSymbol={tokenB}
          />
          <RouteDirectionPanel
            title={`${tokenB} -> ${tokenA}`}
            route={activeRoute.routeBtoA}
            fromTokenSymbol={tokenB}
            toTokenSymbol={tokenA}
          />

          {!hasRouteInfo && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/70 px-4 py-6 text-center text-sm text-gray-500">
              No route info available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

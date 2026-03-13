release:
	@set -a; \
	if [ -f .env ]; then . ./.env; fi; \
	test -n "$$DEPLOY_HOST" || { echo "DEPLOY_HOST is not set. Add it to .env."; exit 1; }; \
	test -n "$$DEPLOY_PATH" || { echo "DEPLOY_PATH is not set. Add it to .env."; exit 1; }; \
	npm run build && rsync -avz --delete \
	--exclude 'node_modules' \
	--exclude config.json \
	--exclude .git \
	.next package.json next.config.js \
	"$${DEPLOY_USER:+$$DEPLOY_USER@}$$DEPLOY_HOST:$$DEPLOY_PATH"
	@echo "Dont forget to upload config.json"

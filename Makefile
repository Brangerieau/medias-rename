-include .env
-include .env.local

NPM					?= npm
DOCKER 				?= docker
DOCKER_COMPOSE 		?= COMPOSE_PROJECT_NAME=$(PROJECT_NAME) $(DOCKER) compose
RUN_IN_BUILDER		?= $(DOCKER_COMPOSE) run --rm builder

define main_title
	@{ \
	set -e ;\
	msg="Make $@";\
	echo "\n\033[34m$$msg" ;\
	for i in $$(seq 1 $${#msg}) ; do printf '=' ; done ;\
	echo "\033[0m\n" ;\
	}
endef

##@ Development

install: package.json ## Install dependencies (natively, on the host)
	$(call main_title,)
	$(NPM) install

start: ## Run the application (natively, on the host)
	$(call main_title,)
	$(NPM) start

##@ Build

build-mac: ## Package the macOS build (requires a macOS host)
	$(call main_title,)
	$(NPM) run build:mac

build-linux: ## Package the Linux build (inside Docker)
	$(call main_title,)
	$(RUN_IN_BUILDER) sh -c "npm install && npx electron-builder --linux"

# L'installeur NSIS demande a Wine d'executer le setup genere, ce qui crashe
# sous emulation QEMU sur Apple Silicon (pages memoire de 16 Ko). A lancer
# depuis une CI amd64 ; en local, utiliser build-win-zip.
build-win: ## Package the Windows installer (inside Docker, needs an amd64 host)
	$(call main_title,)
	$(RUN_IN_BUILDER) sh -c "npm install && npx electron-builder --win"

build-win-zip: ## Package the Windows build as a zip (works on Apple Silicon)
	$(call main_title,)
	$(RUN_IN_BUILDER) sh -c "npm install && npx electron-builder --win zip"

##@ Docker

image: ## Build the packaging image
	$(call main_title,)
	$(DOCKER_COMPOSE) build

terminal: ## Open a shell inside the packaging container
	$(call main_title,)
	$(RUN_IN_BUILDER) bash

clean: ## Remove the build output and the Docker volumes
	$(call main_title,)
	rm -rf dist
	$(DOCKER_COMPOSE) down --remove-orphans --volumes

##@ Utility

help:  ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
.DEFAULT_GOAL := help

.PHONY: install start build-mac build-linux build-win build-win-zip image terminal clean help

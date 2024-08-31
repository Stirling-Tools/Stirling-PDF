vite-build:
	npx tsc
	npx vite build

vite-dockerize:
	make vite-build
	bash -c "cp ../package-lock.json ./"
	docker build . -t stirling-pdf:latest
	bash -c "rm ./package-lock.json"
	docker image prune

tauri-build:
	npx tauri build
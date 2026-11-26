{
  description = "EmbeddableCut - an embeddable video editing SDK built on FreeCut";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachSystem ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"] (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          # Google Chrome is the one unfree package: the renderer needs its
          # H.264 and AAC encoders, which Chromium doesn't ship.
          config.allowUnfreePredicate = pkg: pkgs.lib.getName pkg == "google-chrome";
        };
        inherit (pkgs) lib;

        nodejs = pkgs.nodejs_24;

        # nixpkgs packages Chrome for x86_64 Linux only. Elsewhere the renderer
        # finds the system's Chrome through Playwright's `chrome` channel.
        chrome =
          if system == "x86_64-linux"
          then pkgs.google-chrome
          else null;
        chromeEnv = lib.optionalAttrs (chrome != null) {
          EMBEDDABLECUT_CHROME_PATH = "${chrome}/bin/google-chrome-stable";
        };

        # Firefox for its end-to-end suite (`just render test-firefox`), built
        # with FFmpeg for H.264, AAC and HEVC. nixpkgs builds it for Linux.
        firefox =
          if pkgs.stdenv.hostPlatform.isLinux
          then pkgs.firefox
          else null;
        firefoxEnv = lib.optionalAttrs (firefox != null) {
          EMBEDDABLECUT_FIREFOX_PATH = "${firefox}/bin/firefox";
        };

        # One npm workspace: the packages build against each other's sources,
        # so every package.json and the shared lockfile travel together.
        workspaceSrc = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [
            ./package.json
            ./package-lock.json
            ./.oxlintrc.json
            ./.oxfmtrc.json
            (lib.fileset.difference ./engine (lib.fileset.maybeMissing ./engine/node_modules))
            (lib.fileset.difference ./sdk (lib.fileset.maybeMissing ./sdk/node_modules))
            (lib.fileset.difference ./ui (lib.fileset.unions (map lib.fileset.maybeMissing [
              ./ui/node_modules
              ./ui/dist
            ])))
            (lib.fileset.difference ./web (lib.fileset.unions (map lib.fileset.maybeMissing [
              ./web/node_modules
              ./web/dist
            ])))
            (lib.fileset.difference ./render (lib.fileset.unions (map lib.fileset.maybeMissing [
              ./render/node_modules
              ./render/output
              ./render/assets
            ])))
          ];
        };

        npmArgs = {
          version = "0.0.0";
          src = workspaceSrc;
          inherit nodejs;
          npmDepsHash = "sha256-ZiQr7kCphF0lK7eCPCmVrjSezwNrUhDNjfLkYPPNziw=";
          # Install scripts only fetch native binaries for Node-side inference
          # and Playwright's own browsers, neither of which a build uses.
          npmFlags = ["--ignore-scripts"];
          dontNpmRebuild = true;
          env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          # Vite+ and its linters load prebuilt native addons from npm.
          nativeBuildInputs = lib.optionals pkgs.stdenv.isLinux [pkgs.autoPatchelfHook];
          buildInputs = lib.optionals pkgs.stdenv.isLinux [pkgs.stdenv.cc.cc.lib];
          autoPatchelfIgnoreMissingDeps = ["libc.musl-*.so.1"];
        };

        # The editor app: a static PWA, plus the headless harness page the
        # renderer drives.
        web = pkgs.buildNpmPackage (npmArgs
          // {
            pname = "embeddablecut-web";
            npmWorkspace = "web";
            npmBuildScript = "build";
            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -r web/dist/. $out/
              runHook postInstall
            '';
          });

        # FreeCut's headless renderer: the CLIs and the HTTP service, each a
        # wrapper around Node with the harness, Chrome and ffprobe it needs.
        renderTools = ["render" "frame" "layout" "edit" "agent" "serve"];
        render = pkgs.buildNpmPackage (npmArgs
          // {
            pname = "embeddablecut-render";
            dontNpmBuild = true;
            nativeBuildInputs = npmArgs.nativeBuildInputs ++ [pkgs.makeWrapper];
            installPhase = ''
              runHook preInstall
              lib=$out/lib/embeddablecut-render
              mkdir -p $lib/node_modules $out/bin
              cp -r render/. $lib/
              cp -r node_modules/playwright node_modules/playwright-core node_modules/zod $lib/node_modules/
              for tool in ${lib.concatStringsSep " " renderTools}; do
                makeWrapper ${nodejs}/bin/node $out/bin/embeddablecut-$tool \
                  --add-flags $lib/$tool.mjs \
                  --set EMBEDDABLECUT_HARNESS_DIR ${web} \
                  --prefix PATH : ${lib.makeBinPath [pkgs.ffmpeg-headless]} \
                  ${lib.optionalString (chrome != null) "--set-default EMBEDDABLECUT_CHROME_PATH ${chromeEnv.EMBEDDABLECUT_CHROME_PATH}"}
              done
              runHook postInstall
            '';
            meta = {
              description = "Headless Chrome rendering for EmbeddableCut projects";
              license = lib.licenses.mit;
              mainProgram = "embeddablecut-serve";
            };
          });

        # ---------------------------------------------------------------
        # Dev shells, composed from these groups
        # ---------------------------------------------------------------

        # `just` and what its recipes call; see tasks/ and scripts/tasks/.
        taskPkgs = with pkgs; [
          just
          curl
          jq
          shellcheck
          shfmt
          alejandra
        ];

        webPkgs = [nodejs];

        # The renderer's end-to-end suites synthesise clips with ffmpeg and
        # check what they export with ffprobe.
        renderPkgs =
          [pkgs.ffmpeg]
          ++ lib.optional (chrome != null) chrome
          ++ lib.optional (firefox != null) firefox;

        shellHook = ''
          echo "🎬 EmbeddableCut development environment loaded!"
          echo ""
          echo "  - 🟩 Node.js:  $(node --version 2>/dev/null || echo 'not found')"
          echo "  - 🎞️ ffmpeg:   $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}' || echo 'not found')"
          echo "  - 🌐 Chrome:   ''${EMBEDDABLECUT_CHROME_PATH:-the Playwright chrome channel}"
          echo "  - 🦊 Firefox:  ''${EMBEDDABLECUT_FIREFOX_PATH:-firefox on the PATH}"
          echo ""
          echo "Quickstart:"
          echo "  - 📋 commands: just"
          echo "  - 🚀 editor:   just web dev"
          echo "  - ✅ check:    just check all"
          echo ""
        '';
      in {
        packages.default = web;
        packages.web = web;
        packages.render = render;

        apps.default = flake-utils.lib.mkApp {
          drv = render;
          name = "embeddablecut-serve";
        };

        devShells.default = pkgs.mkShell ({
            packages = taskPkgs ++ webPkgs ++ renderPkgs;
            inherit shellHook;
            # Playwright drives the Chrome above, never one it downloads.
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          }
          // chromeEnv
          // firefoxEnv);

        checks = {
          inherit web render;
          fmt = pkgs.runCommand "embeddablecut-nix-fmt" {nativeBuildInputs = [pkgs.alejandra];} ''
            alejandra --check ${./flake.nix} && touch $out
          '';
        };
      }
    );
}

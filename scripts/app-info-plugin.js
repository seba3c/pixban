export default function appInfoPlugin({ version, repository }) {
  const source = JSON.stringify({ version }) + "\n";
  return {
    name: "pixban-app-info",
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(version),
          __REPOSITORY_URL__: JSON.stringify(repository.url),
        },
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/version.json") return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(source);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source });
    },
  };
}

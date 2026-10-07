const fs = require('fs/promises');
const path = require('path');

/**
 * RouteLoader — auto-discovers every src/modules/<name>/routes.js and
 * mounts it on the Express app at /api/<name>.
 */
class RouteLoader {
  /**
   * @param {import('express').Application} app
   */
  static async register(app) {
    const modulesPath = path.join(process.cwd(), 'src', 'modules');

    let folders;
    try {
      folders = await fs.readdir(modulesPath);
    } catch (err) {
      console.error(`[RouteLoader] Cannot read modules directory: ${err.message}`);
      return;
    }

    for (const folder of folders) {
      const folderPath = path.join(modulesPath, folder);
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) continue;

      const routeFile = path.join(folderPath, 'routes.js');

      try {
        await fs.access(routeFile);
        const router = require(routeFile);
        app.use(`/api/${folder}`, router);
        console.info(`[RouteLoader] ✅ Registered module: ${folder} → /api/${folder}`);
      } catch (_err) {
        // No routes.js in this folder — skip silently
      }
    }
  }
}

module.exports = RouteLoader;

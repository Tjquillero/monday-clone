import type { Browser } from 'puppeteer';

export interface ReportBrowserLaunchOptions {
  headless?: boolean | 'shell';
  args?: string[];
}

/**
 * Lanza una instancia de navegador headless optimizada para generación de reportes PDF.
 * - En Vercel (process.env.VERCEL definido): utiliza puppeteer-core con @sparticuz/chromium.
 * - En local: utiliza puppeteer completo.
 * Lanza un error con code: 'PDF_BROWSER_LAUNCH_FAILED' si falla el arranque.
 */
export async function launchReportBrowser(options: ReportBrowserLaunchOptions = {}): Promise<Browser> {
  const isVercel = Boolean(process.env.VERCEL);

  if (isVercel) {
    try {
      const puppeteerCoreModule: any = await import('puppeteer-core');
      const puppeteerCore = puppeteerCoreModule.default || puppeteerCoreModule;

      const chromiumModule: any = await import('@sparticuz/chromium');
      const chromium = chromiumModule.default || chromiumModule;

      const executablePath = await chromium.executablePath();
      const chromiumArgs = Array.isArray(chromium.args) ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'];
      const mergedArgs = options.args ? [...chromiumArgs, ...options.args] : chromiumArgs;

      return (await puppeteerCore.launch({
        args: mergedArgs,
        executablePath,
        headless: options.headless ?? true,
      })) as unknown as Browser;
    } catch (err: any) {
      const launchError = new Error(`PDF_BROWSER_LAUNCH_FAILED: ${err?.message || String(err)}`);
      (launchError as any).code = 'PDF_BROWSER_LAUNCH_FAILED';
      (launchError as any).cause = err;
      throw launchError;
    }
  } else {
    try {
      const puppeteerModule: any = await import('puppeteer');
      const puppeteer = puppeteerModule.default || puppeteerModule;

      const defaultArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
      const args = options.args ? [...defaultArgs, ...options.args] : defaultArgs;

      return (await puppeteer.launch({
        headless: options.headless ?? true,
        args,
      })) as unknown as Browser;
    } catch (err: any) {
      const launchError = new Error(`PDF_BROWSER_LAUNCH_FAILED: ${err?.message || String(err)}`);
      (launchError as any).code = 'PDF_BROWSER_LAUNCH_FAILED';
      (launchError as any).cause = err;
      throw launchError;
    }
  }
}

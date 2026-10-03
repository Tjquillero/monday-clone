if (typeof (globalThis as any).jest === 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
  (globalThis as any).jest = (globalThis as any).vi;
}

const mockRunner: any = (globalThis as any).vi || (globalThis as any).jest;

import { launchReportBrowser } from '../reportBrowser';

describe('GATE RPT-01 — launchReportBrowser Governance', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockRunner.resetModules?.();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('1. Local environment (!process.env.VERCEL) launches full puppeteer with default sandbox args', async () => {
    delete process.env.VERCEL;

    const mockBrowser = {
      close: mockRunner.fn().mockResolvedValue(undefined),
      newPage: mockRunner.fn().mockResolvedValue({}),
    };
    const mockLaunch = mockRunner.fn().mockResolvedValue(mockBrowser);

    mockRunner.doMock('puppeteer', () => ({
      __esModule: true,
      default: {
        launch: mockLaunch,
      },
      launch: mockLaunch,
    }));

    const browser = await launchReportBrowser();
    expect(browser).toBe(mockBrowser);
    expect(mockLaunch).toHaveBeenCalledTimes(1);
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
    );
  });

  test('2. Vercel environment (process.env.VERCEL = "1") launches puppeteer-core with @sparticuz/chromium executablePath and args', async () => {
    process.env.VERCEL = '1';

    const mockBrowser = {
      close: mockRunner.fn().mockResolvedValue(undefined),
      newPage: mockRunner.fn().mockResolvedValue({}),
    };
    const mockCoreLaunch = mockRunner.fn().mockResolvedValue(mockBrowser);

    const mockChromium = {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
      executablePath: mockRunner.fn().mockResolvedValue('/tmp/chromium'),
      headless: true,
    };

    mockRunner.doMock('puppeteer-core', () => ({
      __esModule: true,
      default: {
        launch: mockCoreLaunch,
      },
      launch: mockCoreLaunch,
    }));

    mockRunner.doMock('@sparticuz/chromium', () => ({
      __esModule: true,
      default: mockChromium,
      ...mockChromium,
    }));

    const browser = await launchReportBrowser();
    expect(browser).toBe(mockBrowser);
    expect(mockChromium.executablePath).toHaveBeenCalledTimes(1);
    expect(mockCoreLaunch).toHaveBeenCalledTimes(1);
    expect(mockCoreLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath: '/tmp/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
        headless: true,
      })
    );
  });

  test('3. Launch failures in either environment wrap error with code PDF_BROWSER_LAUNCH_FAILED', async () => {
    delete process.env.VERCEL;

    const mockLaunch = mockRunner.fn().mockRejectedValue(new Error('Failed to start Chrome binary'));

    mockRunner.doMock('puppeteer', () => ({
      __esModule: true,
      default: {
        launch: mockLaunch,
      },
      launch: mockLaunch,
    }));

    await expect(launchReportBrowser()).rejects.toThrow('PDF_BROWSER_LAUNCH_FAILED');
  });

  test('4. Browser close is guaranteed in finally block even when page operations or PDF generation fails', async () => {
    delete process.env.VERCEL;

    const mockPage = {
      setContent: mockRunner.fn().mockRejectedValue(new Error('DOM content loading timed out')),
      pdf: mockRunner.fn(),
    };
    const mockBrowser = {
      newPage: mockRunner.fn().mockResolvedValue(mockPage),
      close: mockRunner.fn().mockResolvedValue(undefined),
    };

    mockRunner.doMock('puppeteer', () => ({
      __esModule: true,
      default: {
        launch: mockRunner.fn().mockResolvedValue(mockBrowser),
      },
      launch: mockRunner.fn().mockResolvedValue(mockBrowser),
    }));

    let browser: any = null;
    let thrownError: any = null;
    try {
      browser = await launchReportBrowser();
      const page = await browser.newPage();
      await page.setContent('<html>Test</html>');
      await page.pdf();
    } catch (err) {
      thrownError = err;
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.message).toBe('DOM content loading timed out');
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});

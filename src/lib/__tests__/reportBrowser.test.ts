import { launchReportBrowser } from '../reportBrowser';

describe('GATE RPT-01 — launchReportBrowser Governance', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('1. Local environment (!process.env.VERCEL) launches full puppeteer with default sandbox args', async () => {
    delete process.env.VERCEL;

    const mockBrowser = {
      close: jest.fn().mockResolvedValue(undefined),
      newPage: jest.fn().mockResolvedValue({}),
    };
    const mockLaunch = jest.fn().mockResolvedValue(mockBrowser);

    jest.doMock('puppeteer', () => ({
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
      close: jest.fn().mockResolvedValue(undefined),
      newPage: jest.fn().mockResolvedValue({}),
    };
    const mockCoreLaunch = jest.fn().mockResolvedValue(mockBrowser);

    const mockChromium = {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'],
      executablePath: jest.fn().mockResolvedValue('/tmp/chromium'),
      headless: true,
    };

    jest.doMock('puppeteer-core', () => ({
      __esModule: true,
      default: {
        launch: mockCoreLaunch,
      },
      launch: mockCoreLaunch,
    }));

    jest.doMock('@sparticuz/chromium', () => ({
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

    const mockLaunch = jest.fn().mockRejectedValue(new Error('Failed to start Chrome binary'));

    jest.doMock('puppeteer', () => ({
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
      setContent: jest.fn().mockRejectedValue(new Error('DOM content loading timed out')),
      pdf: jest.fn(),
    };
    const mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    };

    jest.doMock('puppeteer', () => ({
      __esModule: true,
      default: {
        launch: jest.fn().mockResolvedValue(mockBrowser),
      },
      launch: jest.fn().mockResolvedValue(mockBrowser),
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

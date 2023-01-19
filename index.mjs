/* global rxjs */

const {
	Subject,
	connectable,
	mergeMap,
	map,
	first,
	defaultIfEmpty,
	takeUntil,
	count,
	share,
	mergeAll,
	BehaviorSubject,
	combineLatest,
	firstValueFrom,
	lastValueFrom,
} = rxjs;

export const init = (launchBrowser) => {
	const newBrowserSubject = new Subject();
	const browsers = connectable(newBrowserSubject.pipe(
		mergeMap(() => {
			const browserProm = launchBrowser();
			browserProm.catch(() => {
				// open browser error => fatal error
				newBrowserSubject.complete();
			});
			const taskSubj = new Subject();
			const results = taskSubj.pipe(
				map(async (fn) => {
					const page = await (await browserProm).newPage();
					try {
						return await fn(page);
					}finally {
						await page.close().catch((e) => {
							// close page error => fatal error
							newBrowserSubject.complete();
							throw e;
						});
					}
				}),
				share(),
			);
			const resSubject = new BehaviorSubject();
			combineLatest([
				newBrowserSubject.pipe(
					defaultIfEmpty(undefined),
					first(),
				),
				results.pipe(
					takeUntil(newBrowserSubject.pipe(
						defaultIfEmpty(undefined),
					)),
					map((p) => p.catch(() => {})),
					mergeAll(() => {}),
					count(),
				),
			]).subscribe(() => {
				browserProm
					.then((browser) => browser.close().catch(() => {
						// close browser error => fatal error
						newBrowserSubject.complete();
					}))
					.catch(() => {})
					.then(() => resSubject.complete());
				taskSubj.complete();
			});
			resSubject.next((fn) => {
				const res = firstValueFrom(results);
				taskSubj.next(fn);
				return res;
			});
			return resSubject;
		}),
	), {connector: () => new BehaviorSubject(), resetOnDisconnect: false, resetOnError: false});
	const subs = browsers.connect();
	newBrowserSubject.next();

	const runWithPage = (fn) => {
		return firstValueFrom(browsers.pipe(
			first(),
			map((browser) => browser(fn)),
		));
	};
	const close = async () => {
		newBrowserSubject.complete();
		await lastValueFrom(browsers.pipe(defaultIfEmpty(undefined)));
		subs.unsubscribe();
	};

	const openNewBrowser = () => newBrowserSubject.next();

	return {
		runWithPage,
		openNewBrowser,
		close,
	};
};


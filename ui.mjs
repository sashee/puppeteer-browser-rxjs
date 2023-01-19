import {init} from "./index.mjs";
/* global preact, preactHooks, htm, immer */

const {h, render} = preact;
const {useState, useEffect} = preactHooks
const {produce} = immer;

const html = htm.bind(h);

let nextBrowserId = 0;
let nextPageId = 0;

const App = () => {
	const [state, setState] = useState({browsers: [], logs: [], pending: []});
	useEffect(() => {
		const handleUnhandledRejection = (event) => {
			console.error(event);
			setState(produce((state) => {
				state.logs.push(`**** Unhandled rejection: ${event.reason}`);
			}));
		};
		window.addEventListener("unhandledrejection", handleUnhandledRejection);
		return () => {
			window.removeEventListener("unhandledrejection", handleUnhandledRejection);
		};
	}, []);
	const waitForPromise = async (type, options) => {
		const id = Symbol();
		return new Promise((res, rej) => {
			setState(produce((state) => {
				state.pending.push(({id, type, ...options, res, rej}));
			}));
		}).finally(() => setState(produce((state) => {
			state.pending = state.pending.filter((pending) => pending.id !== id);
		})));
	};
	const log = (message) => {
		setState(produce((state) => {
			state.logs.push(message);
		}));
	};
	const launchBrowser = async () => {
		const browserId = nextBrowserId++;
		setState(produce((state) => {
			state.browsers.push({
				id: browserId,
				pages: [],
			});
		}));
		log(`Launching browser: ${browserId}`);
		await waitForPromise("launchBrowser", {browserId});
		log(`Launched browser: ${browserId}`);
		return {
			newPage: async () => {
				const pageId = nextPageId++;
				log(`Starting page: ${browserId}/${pageId}`);
				setState(produce((state) => {
					state.browsers.find(({id}) => id === browserId).pages.push({
						title: pageId,
					});
				}));
				try {
					await waitForPromise("browser.newPage", {browserId, pageId});
					return {
						close: async () => {
							log(`Closing page: ${browserId}/${pageId}`);
							await waitForPromise("page.close", {browserId, pageId});
							setState(produce((state) => {
								const browser = state.browsers.find(({id}) => id === browserId);
								browser.pages = browser.pages.filter((page) => page.title !== pageId);
							}));
							log(`Closed page: ${browserId}/${pageId}`);
						},
						title: pageId,
						evaluate: async () => `Result from page ${pageId}`,
					};
				}catch(e){
					setState(produce((state) => {
						const browser = state.browsers.find(({id}) => id === browserId);
						browser.pages = browser.pages.filter((page) => page.title !== pageId);
					}));
					log(`Page open error: ${browserId}/${pageId}`);
					throw e;
				}
			},
			close: async () => {
				log(`Closing browser: ${browserId}`);
				await waitForPromise("browser.close", {browserId});
				setState(produce((state) => {
					state.browsers = state.browsers.filter(({id}) => id !== browserId);
				}));
				log(`Closed browser: ${browserId}`);
			},
		};
	};
	const [handler] = useState(() => init(launchBrowser));
	const openNewBrowser = async () => {
		log("openNewBrowser called");
		try {
			await handler.openNewBrowser();
			log("openNewBrowser finished");
		}catch(e) {
			log(`openNewBrowser threw an error: ${e}`);
		}
	};
	const close = async () => {
		log("close called");
		try {
			await handler.close();
			log("close finished");
		}catch(e) {
			log(`close threw an error: ${e}`);
		}
	};
	const startTask = async () => {
		try {
			log("Calling runWithPage");
			const result = await handler.runWithPage(async (page) => {
				log(`runWithPage handler called with: ${page.title}`);

				await waitForPromise("task", {pageId: page.title});
				const pageText = await page.evaluate();
				return pageText;
			});
			log(`runWithPage finished: ${result}`);
		}catch(e) {
			log(`runWithPage threw an error: ${e}`);
		}
	};
	console.log(state);
	return html`
<div class="container">
	<div class="buttons">
		<button class="btn btn-light" onClick=${openNewBrowser}>Start new browser</button>
		<button class="btn btn-light" onClick=${startTask}>Start task</button>
		<button class="btn btn-light" onClick=${close}>Close</button>
	</div>
	<div class="">
		${state.browsers.map((browser) => html`
			<div class="card">
				<div class="card-body">
					<div class="card-header">
						<h5 class="card-title">Browser ${browser.id}</h5>
					</div>
					<div class="card-text">
						${state.pending.filter(({type, browserId}) => type === "launchBrowser" && browserId === browser.id).map(({res, rej}) => html`
							<h5 class="card-title">
								Browser opening controls
							</h5>
							<button class="btn btn-success" onClick=${res}>Success</button>
							<button class="btn btn-danger" onClick=${rej.bind(undefined, "Browser open error")}>Error</button>
						`)}
						${state.pending.filter(({type, browserId}) => type === "browser.close" && browserId === browser.id).map(({res, rej}) => html`
							<h5 class="card-title">
								Browser closing controls
							</h5>
							<button class="btn btn-success" onClick=${res}>Success</button>
							<button class="btn btn-danger" onClick=${rej.bind(undefined, "Browser close error")}>Error</button>
						`)}
						<div class="">
							${browser.pages.map((page) => html`
								<div class="card m-3 text-bg-info">
									<div class="card-body">
										<div class="card-header">
											<h5 class="card-title">Page ${page.title}</h5>
										</div>
										<div class="card-text">
											${state.pending.filter(({type, browserId, pageId}) => type === "browser.newPage" && browserId === browser.id && pageId === page.title).map(({res, rej}) => html`
												<h5 class="card-title">
													Page opening controls
												</h5>
												<button class="btn btn-success" onClick=${res}>Success</button>
												<button class="btn btn-danger" onClick=${rej.bind(undefined, "Page open error")}>Error</button>
											`)}
											${state.pending.filter(({type, pageId}) => type === "task" && pageId === page.title).map(({res, rej}) => html`
												<h5 class="card-title">
													Task controls
												</h5>
												<button class="btn btn-success" onClick=${res}>Success</button>
												<button class="btn btn-danger" onClick=${rej.bind(undefined, "Task error")}>Error</button>
											`)}
											${state.pending.filter(({type, browserId, pageId}) => type === "page.close" && browserId === browser.id && pageId === page.title).map(({res, rej}) => html`
												<h5 class="card-title">
													Page closing controls
												</h5>
												<button class="btn btn-success" onClick=${res}>Success</button>
												<button class="btn btn-danger" onClick=${rej.bind(undefined, "Page close error")}>Error</button>
											`)}
										</div>
									</div>
								</div>
							`)}
						</div>
					</div>
				</div>
			</div>
		`)}
	</div>
	<div class="">
		${state.logs.map((log) => html`
			<div>${log}</div>
		`)}
	</div>
</div>`;
};

render(html`<${App}/>`, document.body);


import './styles/tokens.css';
import './styles/title.css';
import './styles/hud.css';
import './styles/sheets.css';
import './styles/report.css';
import './styles/board.css';
import './styles/replay.css';
import './styles/motion.css';
import { App } from './game/app';
import { installDebug } from './game/debug';
import { shareRedirect } from './game/routes';
import { q } from './ui/dom';

const share = shareRedirect(location.pathname);
if (share) history.replaceState(null, '', `/${location.search}${share}`);

const params = new URLSearchParams(location.search);
const debug = params.get('debug') === '1';
const app = new App(params, q<HTMLCanvasElement>(document, '#cv'), q(document, '#ui'));
const first = app.boot();
if (!(debug && app.jump(params.get('screen') ?? '', Number(params.get('ff') ?? 0)))) app.route(first);
if (debug) installDebug(app);

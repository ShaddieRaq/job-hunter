import { startApiServer } from './server.js';

const port = Number(process.env.API_PORT ?? 3001);

startApiServer(port);

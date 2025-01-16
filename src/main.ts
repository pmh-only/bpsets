import { WebServer } from './WebServer'

const port = process.env.PORT ? parseInt(process.env.PORT) : 2424

new WebServer(port)

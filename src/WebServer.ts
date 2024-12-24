import express, { Request, Response } from 'express'
import { APIServer } from './APIServer'

export class WebServer {  
  private readonly app = express()
  private readonly apiServer = new APIServer()

  constructor (
    private readonly port = 2424
  ) {
    this.initRoutes()
    this.app.listen(this.port, this.showBanner.bind(this))
  }
  
  private initRoutes () {
    this.app.use(express.static('./public'))
    this.app.use('/api', this.apiServer.getRouter())
    this.app.use(this.error404)
  }

  private error404 (_: Request, res: Response) {
    res.status(404).send({ success: false, message: 'Page not found' })
  }

  private showBanner () {
    console.log(`

       _______  _______  _______  _______  _______  _______ 
      |  _    ||       ||       ||       ||       ||       |
      | |_|   ||    _  ||  _____||    ___||_     _||  _____|
      |       ||   |_| || |_____ |   |___   |   |  | |_____ 
      |  _   | |    ___||_____  ||    ___|  |   |  |_____  |
      | |_|   ||   |     _____| ||   |___   |   |   _____| |
      |_______||___|    |_______||_______|  |___|  |_______|
                                  Created By Minhyeok Park
      
      Server is now on http://127.0.0.1:${this.port}

    `
      .split('\n')
      .map((v) => v.replace(/      /, ''))
      .join('\n')
    )
  }
}

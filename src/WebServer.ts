import express from 'express'

export class WebServer {
  private readonly app = express()
  
  public WebServer () {

  }
  
  private initRoutes () {

  }

  public listen() {
    this.app.listen()
  }
}

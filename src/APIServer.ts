import express, { Request, Response } from 'express'

export class APIServer {  
  private readonly router =
    express.Router()

  constructor () {
    this.router.get('/bp_status', this.getBPStatus.bind(this))
  }

  private getBPStatus (req: Request, res: Response) {
    res.send([])
  }

  public getRouter = () =>
    this.router
}

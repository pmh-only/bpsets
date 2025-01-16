import express, { Request, Response } from 'express'
import { BPManager } from './BPManager'
import { BPSetMetadata, BPSetStats } from './types'
import { Memorizer } from './Memorizer'
import path from 'path'

export class WebServer {
  private readonly app = express()
  private readonly bpManager = BPManager.getInstance()

  constructor(private readonly port = 2424) {
    this.app.set('view engine', 'ejs')
    this.app.set('views', path.join(__dirname, '../views'))

    this.app.get('/', this.getMainPage.bind(this))
    this.app.get('/check', this.runCheckOnce.bind(this))
    this.app.get('/check_all', this.runCheckAll.bind(this))

    this.app.use('/fix', express.urlencoded())
    this.app.post('/fix', this.runFix.bind(this))

    this.app.use(this.error404)

    this.app.listen(this.port, this.showBanner.bind(this))
  }

  private getMainPage(req: Request, res: Response) {
    const hidePass = req.query['hidePass'] === 'true'
    const bpStatus: {
      category: string
      metadatas: (BPSetMetadata & BPSetStats)[]
    }[] = []

    const bpMetadatas = this.bpManager.getBPSets().map((v, idx) => ({ ...v, idx }))
    const categories = new Set(bpMetadatas.map((v) => v.getMetadata().awsService))

    for (const category of categories)
      bpStatus.push({
        category,
        metadatas: bpMetadatas
          .filter(
            (v) =>
              v.getMetadata().awsService === category && (!hidePass || v.getStats().nonCompliantResources.length > 0)
          )
          .map((v) => ({ ...v.getMetadata(), ...v.getStats(), idx: v.idx }))
      })

    res.render('index', {
      bpStatus: bpStatus.filter(({ metadatas }) => metadatas.length > 0),
      bpLength: bpMetadatas.length,
      hidePass
    })
  }

  private async runCheckOnce(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')

    res.write('<script src="https://cdn.tailwindcss.com"></script>')
    res.write('<body class="bg-gray-100 text-gray-800">')
    res.write('<div class="container mx-auto p-4">')
    res.write('<script>setInterval(() => window.scrollTo(0, document.body.scrollHeight), 100)</script>')
    res.write('<pre>Start Checking....\n')

    const { name, hidePass } = req.query
    if (typeof name !== 'string' || name.length < 1) {
      res.write('<a href="/">Failed. name not found. Return to Report Page')
      res.end()
      return
    }

    Memorizer.reset()
    await this.bpManager.runCheckOnce(name)

    res.write(`<a href="/?hidePass=${hidePass}">Done. Return to Report Page</a>`)
    res.write(`<script>window.location.replace('/?hidePass=${hidePass}')</script>`)
    res.end()
  }

  private async runCheckAll(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')

    const { hidePass } = req.query

    res.write('<script src="https://cdn.tailwindcss.com"></script>')
    res.write('<body class="bg-gray-100 text-gray-800">')
    res.write('<div class="container mx-auto p-4">')
    res.write('<script>setInterval(() => window.scrollTo(0, document.body.scrollHeight), 100)</script>')
    res.write('<pre>Start Checking....\n')

    Memorizer.reset()
    await this.bpManager.runCheckAll((name) => res.write(`${name} - FINISHED\n`))

    res.write(`<a href="/?hidePass=${hidePass}">Done. Return to Report Page</a>`)
    res.write(`<script>window.location.replace('/?hidePass=${hidePass}')</script>`)
    res.end()
  }

  private async runFix(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')

    res.write('<script src="https://cdn.tailwindcss.com"></script>')
    res.write('<body class="bg-gray-100 text-gray-800">')
    res.write('<div class="container mx-auto p-4">')
    res.write('<pre>Start Fixing....\n')

    const { name, hidePass } = req.query
    if (typeof name !== 'string' || name.length < 1) {
      res.write('<a href="/">Failed. name not found. Return to Report Page')
      res.end()
      return
    }

    const requiredParametersForFix = Object.keys(req.body).map((k) => ({ name: k, value: req.body[k] }))

    await this.bpManager.runFix(name, requiredParametersForFix).catch((error) => {
      res.write(error.toString() + '\n')
    })

    res.write(`<a href="/?hidePass=${hidePass}">Done. Return to Report Page`)
    res.write(`<script>window.location.replace('/?hidePass=${hidePass}')</script>`)
    res.end()
  }

  private error404(_: Request, res: Response) {
    res.status(404).send({ success: false, message: 'Page not found' })
  }

  private showBanner() {
    console.log(
      `

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
        .map((v) => v.replace(/ {6}/, ''))
        .join('\n')
    )
  }
}

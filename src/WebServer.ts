import express, { Request, Response } from 'express'
import { BPManager } from './BPManager'
import { BPSetMetadata } from './types'
import { Memorizer } from './Memorizer'

export class WebServer {  
  private readonly app = express()
  private readonly bpManager =
    BPManager.getInstance()

  constructor (
    private readonly port = 2424
  ) {
    this.app.set('view engine', 'ejs')
    this.app.set('views', './views');
    
    this.app.get('/', this.getMainPage.bind(this))
    this.app.get('/check', this.runCheckOnce.bind(this))
    this.app.get('/check_all', this.runCheckAll.bind(this))

    this.app.use('/fix', express.urlencoded())
    this.app.post('/fix', this.runFix.bind(this))

    this.app.use(this.error404)
    
    this.app.listen(this.port, this.showBanner.bind(this))
  }
  
  private getMainPage(req: Request, res: Response) {
    const bpStatus: {
      category: string,
      metadatas: BPSetMetadata[]
    }[] = []

    const bpMetadatas = this.bpManager.getBPSetMetadatas()
    const categories = new Set(bpMetadatas.map((v) => v?.awsService))
    const hidePass = req.query['hidePass'] === 'true'

    for (const category of categories)
      bpStatus.push({
        category,
        metadatas: bpMetadatas.filter((v) =>
          v.awsService === category &&
          (!hidePass || v.nonCompliantResources.length > 0))
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

    res.write(`<a href="/?hidePass=${hidePass}">Done. Return to Report Page`)
    res.end()
  }

  private async runCheckAll(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')

    const { hidePass } = req.query

    res.write('<script>setInterval(() => window.scrollTo(0, document.body.scrollHeight), 100)</script>')
    res.write('<pre>Start Checking....\n')

    Memorizer.reset()
    await this.bpManager.runCheckAll((name) =>
      res.write(`${name} - FINISHED\n`))

    res.write(`<a href="/?hidePass=${hidePass}">Done. Return to Report Page`)
    res.end()
  }

  private async runFix(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')

    res.write('<pre>Start Fixing....\n')
    
    const { name, hidePass } = req.query
    if (typeof name !== 'string' || name.length < 1) {
      res.write('<a href="/">Failed. name not found. Return to Report Page')
      res.end()
      return
    }

    const requiredParametersForFix =
      Object
        .keys(req.body)
        .map((k) => ({ name: k, value: req.body[k] }))

    await this.bpManager.runFix(name, requiredParametersForFix)
      .catch((error) => {
        res.write(error.toString() + '\n')
      })

    res.write(`<a href="/?hidePass=${hidePass}">Done. Return to Report Page`)
    res.end()
  }

  private error404 (_: Request, res: Response) {
    res.status(404).send({ success: false, message: 'Page not found' })
  }

  private showBanner() {
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

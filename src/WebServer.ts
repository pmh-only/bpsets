import express, { Request, Response } from 'express'
import { BPManager } from './BPManager'
import { BPSetMetadata } from './types'

export class WebServer {  
  private readonly app = express()
  private readonly bpManager =
    BPManager.getInstance()

  constructor (
    private readonly port = 2424
  ) {
    this.app.set('view engine', 'ejs')
    this.app.set('views', './views');
    this.app.use(express.static('./public'))
    
    this.app.get('/', this.getMainPage.bind(this))
    this.app.get('/check_all', this.runCheck.bind(this))
    this.app.use(this.error404)
    
    this.app.listen(this.port, this.showBanner.bind(this))
  }
  
  private getMainPage(_: Request, res: Response) {
    const bpStatus: {
      category: string,
      metadatas: BPSetMetadata[]
    }[] = []

    const bpMetadatas = this.bpManager.getBPSetMetadatas()
    const categories = new Set(bpMetadatas.map((v) => v?.awsService))

    for (const category of categories)
      bpStatus.push({
        category,
        metadatas: bpMetadatas.filter((v) => v.awsService === category)
      })

    res.render('index', {
      bpStatus,
      bpLength: bpMetadatas.length
    })
  }

  
  private runCheck(_: Request, res: Response) {
    void this.bpManager.runCheck()
    res.redirect('/')
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

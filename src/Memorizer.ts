import { Client } from '@smithy/smithy-client'
import shajs from 'sha.js'

export class Memorizer {
  private static memorized = new Map<string, Memorizer>()

  public static memo (client: Client<any, any, any, any>) {
    const memorized = this.memorized.get(client.constructor.name)

    if (memorized !== undefined)
      return memorized

    const newMemo = new Memorizer(client)
    this.memorized.set(client.constructor.name, newMemo)

    return newMemo
  }

  private memorized = new Map<string, any>()

  private constructor (
    private client: Client<any, any, any, any>
  ) {}

  public readonly send: typeof this.client.send = async (command) => {
    const serialized = JSON.stringify([command.constructor.name, command.input])
    const hashed = shajs('sha256').update(serialized).digest('hex')

    const memorized = this.memorized.get(hashed)
    if (memorized !== undefined)
      return memorized

    const newMemo = await this.client.send(command)
    this.memorized.set(hashed, newMemo)

    return newMemo
  }
}

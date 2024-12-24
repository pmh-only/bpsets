import { Client } from '@smithy/smithy-client'
import shajs from 'sha.js'

/**
 * Memorize AWS SDK operation results.
 * This util class tend to be always re-use AWS SDK Client
 * which makes operation more faster and optimize memory usage.
 * 
 * All results will be store as Key-Value hash map.
 * * Key: sha256(serialize([OPERATION_NAME, OPERATION_INPUT_PARAMETER]))
 * * Value: OPERATION_OUTPUT
 * 
 * @author Minhyeok Park <pmh_only@pmh.codes>
 */
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

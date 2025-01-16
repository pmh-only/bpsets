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

  public static memo(client: Client<unknown, unknown, unknown, unknown>, salt = '') {
    const serialized = JSON.stringify([client.constructor.name, salt])
    const hashed = shajs('sha256').update(serialized).digest('hex')

    const memorized = this.memorized.get(hashed)

    if (memorized !== undefined) return memorized

    const newMemo = new Memorizer(client)
    this.memorized.set(hashed, newMemo)

    return newMemo
  }

  public static reset() {
    for (const memorized of Memorizer.memorized.values()) memorized.reset()
  }

  private memorized = new Map<string, unknown>()

  private constructor(private client: Client<unknown, unknown, unknown, unknown>) {}

  public readonly send: typeof this.client.send = async (command) => {
    const serialized = JSON.stringify([command.constructor.name, command.input])
    const hashed = shajs('sha256').update(serialized).digest('hex')

    const memorized = this.memorized.get(hashed)
    if (memorized !== undefined) return memorized

    console.log(command.constructor.name, 'Executed.')

    const newMemo = await this.client.send(command)
    this.memorized.set(hashed, newMemo)

    return newMemo
  }

  private readonly reset = () => this.memorized.clear()
}

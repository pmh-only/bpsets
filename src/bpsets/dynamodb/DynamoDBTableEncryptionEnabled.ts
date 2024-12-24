import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  UpdateTableCommand
} from '@aws-sdk/client-dynamodb'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class DynamoDBTableEncryptionEnabled implements BPSet {
  private readonly client = new DynamoDBClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTables = async () => {
    const tableNames = await this.memoClient.send(new ListTablesCommand({}))
    const tables = []
    for (const tableName of tableNames.TableNames || []) {
      const tableDetails = await this.memoClient.send(
        new DescribeTableCommand({ TableName: tableName })
      )
      tables.push(tableDetails.Table!)
    }
    return tables
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const tables = await this.getTables()

    for (const table of tables) {
      if (table.SSEDescription?.Status === 'ENABLED') {
        compliantResources.push(table.TableArn!)
      } else {
        nonCompliantResources.push(table.TableArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const tableName = arn.split('/').pop()!

      await this.client.send(
        new UpdateTableCommand({
          TableName: tableName,
          SSESpecification: {
            Enabled: true
          }
        })
      )
    }
  }
}

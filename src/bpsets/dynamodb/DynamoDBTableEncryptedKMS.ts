import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  UpdateTableCommand
} from '@aws-sdk/client-dynamodb'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class DynamoDBTableEncryptedKMS implements BPSet {
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
      if (
        table.SSEDescription?.Status === 'ENABLED' &&
        table.SSEDescription?.SSEType === 'KMS'
      ) {
        compliantResources.push(table.TableArn!)
      } else {
        nonCompliantResources.push(table.TableArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'kms-key-id' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const kmsKeyId = requiredParametersForFix.find(param => param.name === 'kms-key-id')?.value

    if (!kmsKeyId) {
      throw new Error("Required parameter 'kms-key-id' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const tableName = arn.split('/').pop()!

      await this.client.send(
        new UpdateTableCommand({
          TableName: tableName,
          SSESpecification: {
            Enabled: true,
            SSEType: 'KMS',
            KMSMasterKeyId: kmsKeyId
          }
        })
      )
    }
  }
}

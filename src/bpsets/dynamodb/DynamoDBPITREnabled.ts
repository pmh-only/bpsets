import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  DescribeContinuousBackupsCommand,
  UpdateContinuousBackupsCommand
} from '@aws-sdk/client-dynamodb'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class DynamoDBPITREnabled implements BPSet {
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
      const backupStatus = await this.memoClient.send(
        new DescribeContinuousBackupsCommand({
          TableName: table.TableName!
        })
      )

      if (
        backupStatus.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
          ?.PointInTimeRecoveryStatus === 'ENABLED'
      ) {
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
        new UpdateContinuousBackupsCommand({
          TableName: tableName,
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true
          }
        })
      )
    }
  }
}

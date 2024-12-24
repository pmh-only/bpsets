import {
  RDSClient,
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class DBInstanceBackupEnabled implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDBInstances = async () => {
    const response = await this.memoClient.send(new DescribeDBInstancesCommand({}))
    return response.DBInstances || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const dbInstances = await this.getDBInstances()

    for (const instance of dbInstances) {
      if (instance.BackupRetentionPeriod && instance.BackupRetentionPeriod > 0) {
        compliantResources.push(instance.DBInstanceArn!)
      } else {
        nonCompliantResources.push(instance.DBInstanceArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'retention-period', value: '7' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const retentionPeriod = requiredParametersForFix.find(
      param => param.name === 'retention-period'
    )?.value

    if (!retentionPeriod) {
      throw new Error("Required parameter 'retention-period' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const instanceId = arn.split(':instance/')[1]
      await this.client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: instanceId,
          BackupRetentionPeriod: parseInt(retentionPeriod, 10)
        })
      )
    }
  }
}

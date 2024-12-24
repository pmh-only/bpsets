import {
  RDSClient,
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSEnhancedMonitoringEnabled implements BPSet {
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
      if (instance.MonitoringInterval && instance.MonitoringInterval > 0) {
        compliantResources.push(instance.DBInstanceArn!)
      } else {
        nonCompliantResources.push(instance.DBInstanceArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'monitoring-interval', value: '60' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const monitoringInterval = requiredParametersForFix.find(
      param => param.name === 'monitoring-interval'
    )?.value

    if (!monitoringInterval) {
      throw new Error("Required parameter 'monitoring-interval' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const instanceId = arn.split(':instance/')[1]

      await this.client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: instanceId,
          MonitoringInterval: parseInt(monitoringInterval, 10)
        })
      )
    }
  }
}

import {
  RDSClient,
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class RDSInstancePublicAccessCheck implements BPSet {
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
      if (instance.PubliclyAccessible) {
        nonCompliantResources.push(instance.DBInstanceArn!)
      } else {
        compliantResources.push(instance.DBInstanceArn!)
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
      const instanceId = arn.split(':instance/')[1]

      await this.client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: instanceId,
          PubliclyAccessible: false
        })
      )
    }
  }
}

import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class RDSClusterMultiAZEnabled implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDBClusters = async () => {
    const response = await this.memoClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const dbClusters = await this.getDBClusters()

    for (const cluster of dbClusters) {
      if ((cluster.AvailabilityZones || []).length > 1) {
        compliantResources.push(cluster.DBClusterArn!)
      } else {
        nonCompliantResources.push(cluster.DBClusterArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'additional-azs', value: '2' }]
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    throw new Error(
      'Enabling Multi-AZ requires cluster reconfiguration. This must be performed manually.'
    )
  }
}

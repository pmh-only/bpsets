import {
  RDSClient,
  DescribeDBClustersCommand,
  ModifyDBClusterCommand
} from '@aws-sdk/client-rds'
import { EC2Client, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSDBSecurityGroupNotAllowed implements BPSet {
  private readonly rdsClient = new RDSClient({})
  private readonly ec2Client = new EC2Client({})
  private readonly memoRdsClient = Memorizer.memo(this.rdsClient)
  private readonly memoEc2Client = Memorizer.memo(this.ec2Client)

  private readonly getDBClusters = async () => {
    const response = await this.memoRdsClient.send(new DescribeDBClustersCommand({}))
    return response.DBClusters || []
  }

  private readonly getDefaultSecurityGroups = async () => {
    const response = await this.memoEc2Client.send(
      new DescribeSecurityGroupsCommand({ Filters: [{ Name: 'group-name', Values: ['default'] }] })
    )
    return response.SecurityGroups || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const dbClusters = await this.getDBClusters()
    const defaultSecurityGroupIds = (await this.getDefaultSecurityGroups()).map(sg => sg.GroupId!)

    for (const cluster of dbClusters) {
      const activeSecurityGroups = cluster.VpcSecurityGroups?.filter(sg => sg.Status === 'active') || []

      if (activeSecurityGroups.some(sg => defaultSecurityGroupIds.includes(sg.VpcSecurityGroupId!))) {
        nonCompliantResources.push(cluster.DBClusterArn!)
      } else {
        compliantResources.push(cluster.DBClusterArn!)
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
      const clusterId = arn.split(':cluster/')[1]

      // Remove default security groups by modifying the cluster's security group configuration
      await this.rdsClient.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          VpcSecurityGroupIds: [] // Update to valid non-default security groups
        })
      )
    }
  }
}

import { RDSClient, DescribeDBClustersCommand, ModifyDBClusterCommand } from '@aws-sdk/client-rds'
import { EC2Client, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSDBSecurityGroupNotAllowed implements BPSet {
  private readonly rdsClient = new RDSClient({})
  private readonly ec2Client = new EC2Client({})
  private readonly memoRdsClient = Memorizer.memo(this.rdsClient)
  private readonly memoEc2Client = Memorizer.memo(this.ec2Client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSDBSecurityGroupNotAllowed',
    description: 'Ensures RDS clusters are not associated with the default security group.',
    priority: 2,
    priorityReason: 'Default security groups may allow unrestricted access, posing a security risk.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: true,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBClustersCommand',
        reason: 'Fetch RDS cluster details including associated security groups.'
      },
      {
        name: 'DescribeSecurityGroupsCommand',
        reason: 'Fetch details of default security groups.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBClusterCommand',
        reason: 'Remove default security groups from the RDS cluster configuration.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure valid non-default security groups are associated with the clusters before applying the fix.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const dbClusters = await this.getDBClusters()
    const defaultSecurityGroupIds = (await this.getDefaultSecurityGroups()).map((sg) => sg.GroupId!)

    for (const cluster of dbClusters) {
      const activeSecurityGroups = cluster.VpcSecurityGroups?.filter((sg) => sg.Status === 'active') || []

      if (activeSecurityGroups.some((sg) => defaultSecurityGroupIds.includes(sg.VpcSecurityGroupId!))) {
        nonCompliantResources.push(cluster.DBClusterArn!)
      } else {
        compliantResources.push(cluster.DBClusterArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const clusterId = arn.split(':cluster/')[1]

      await this.rdsClient.send(
        new ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          VpcSecurityGroupIds: [] // Ensure valid non-default security groups are used here
        })
      )
    }
  }

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
}

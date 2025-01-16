import { EFSClient, DescribeFileSystemsCommand, DescribeMountTargetsCommand } from '@aws-sdk/client-efs'
import { EC2Client, DescribeRouteTablesCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EFSMountTargetPublicAccessible implements BPSet {
  private readonly efsClient = new EFSClient({})
  private readonly ec2Client = new EC2Client({})
  private readonly memoEFSClient = Memorizer.memo(this.efsClient)
  private readonly memoEC2Client = Memorizer.memo(this.ec2Client)

  private readonly getFileSystems = async () => {
    const response = await this.memoEFSClient.send(new DescribeFileSystemsCommand({}))
    return response.FileSystems || []
  }

  private readonly getRoutesForSubnet = async (subnetId: string) => {
    const response = await this.memoEC2Client.send(
      new DescribeRouteTablesCommand({
        Filters: [{ Name: 'association.subnet-id', Values: [subnetId] }]
      })
    )
    return response.RouteTables?.[0]?.Routes || []
  }

  public readonly getMetadata = () => ({
    name: 'EFSMountTargetPublicAccessible',
    description: 'Checks if EFS mount targets are publicly accessible.',
    priority: 2,
    priorityReason:
      'Publicly accessible EFS mount targets may pose a security risk by exposing data to unintended access.',
    awsService: 'EFS',
    awsServiceCategory: 'File System',
    bestPracticeCategory: 'Network Configuration',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeFileSystemsCommand',
        reason: 'Retrieve the list of EFS file systems.'
      },
      {
        name: 'DescribeMountTargetsCommand',
        reason: 'Retrieve the list of mount targets for a file system.'
      },
      {
        name: 'DescribeRouteTablesCommand',
        reason: 'Check route tables associated with the mount target subnets.'
      }
    ],
    commandUsedInFixFunction: [],
    adviseBeforeFixFunction:
      'Ensure that the network configurations are reviewed carefully to avoid breaking application connectivity.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const fileSystems = await this.getFileSystems()

    for (const fileSystem of fileSystems) {
      const mountTargets = await this.memoEFSClient.send(
        new DescribeMountTargetsCommand({ FileSystemId: fileSystem.FileSystemId! })
      )

      let isNonCompliant = false

      for (const mountTarget of mountTargets.MountTargets || []) {
        const routes = await this.getRoutesForSubnet(mountTarget.SubnetId!)

        if (routes.some((route) => route.DestinationCidrBlock === '0.0.0.0/0' && route.GatewayId?.startsWith('igw-'))) {
          nonCompliantResources.push(fileSystem.FileSystemArn!)
          isNonCompliant = true
          break
        }
      }

      if (!isNonCompliant) {
        compliantResources.push(fileSystem.FileSystemArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async () => {
    throw new Error('Fixing public accessibility for mount targets requires manual network reconfiguration.')
  }
}

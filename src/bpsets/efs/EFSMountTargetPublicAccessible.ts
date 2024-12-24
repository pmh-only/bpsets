import {
  EFSClient,
  DescribeFileSystemsCommand,
  DescribeMountTargetsCommand
} from '@aws-sdk/client-efs'
import { EC2Client, DescribeRouteTablesCommand } from '@aws-sdk/client-ec2'
import { BPSet } from '../../types'
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

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const fileSystems = await this.getFileSystems()

    for (const fileSystem of fileSystems) {
      const mountTargets = await this.memoEFSClient.send(
        new DescribeMountTargetsCommand({ FileSystemId: fileSystem.FileSystemId! })
      )

      for (const mountTarget of mountTargets.MountTargets || []) {
        const routes = await this.getRoutesForSubnet(mountTarget.SubnetId!)

        for (const route of routes) {
          if (
            route.DestinationCidrBlock === '0.0.0.0/0' &&
            route.GatewayId?.startsWith('igw-')
          ) {
            nonCompliantResources.push(fileSystem.FileSystemArn!)
            break
          }
        }
      }

      if (!nonCompliantResources.includes(fileSystem.FileSystemArn!)) {
        compliantResources.push(fileSystem.FileSystemArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    throw new Error(
      'Fixing public accessibility for mount targets requires manual network reconfiguration.'
    )
  }
}

import {
  EC2Client,
  DescribeVpcPeeringConnectionsCommand,
  ModifyVpcPeeringConnectionOptionsCommand
} from '@aws-sdk/client-ec2'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class VPCPeeringDNSResolutionCheck implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly check = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []

    const response = await this.memoClient.send(new DescribeVpcPeeringConnectionsCommand({}))
    const vpcPeeringConnections = response.VpcPeeringConnections || []

    for (const connection of vpcPeeringConnections) {
      const accepterOptions = connection.AccepterVpcInfo?.PeeringOptions
      const requesterOptions = connection.RequesterVpcInfo?.PeeringOptions

      if (
        !accepterOptions?.AllowDnsResolutionFromRemoteVpc ||
        !requesterOptions?.AllowDnsResolutionFromRemoteVpc
      ) {
        nonCompliantResources.push(connection.VpcPeeringConnectionId!)
      } else {
        compliantResources.push(connection.VpcPeeringConnectionId!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const connectionId of nonCompliantResources) {
      await this.client.send(
        new ModifyVpcPeeringConnectionOptionsCommand({
          VpcPeeringConnectionId: connectionId,
          AccepterPeeringConnectionOptions: {
            AllowDnsResolutionFromRemoteVpc: true
          },
          RequesterPeeringConnectionOptions: {
            AllowDnsResolutionFromRemoteVpc: true
          }
        })
      )
    }
  }
}

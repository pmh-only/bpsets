import {
  EC2Client,
  DescribeSubnetsCommand,
  ModifySubnetAttributeCommand,
} from '@aws-sdk/client-ec2';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class SubnetAutoAssignPublicIPDisabled implements BPSet {
  private readonly client = new EC2Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'SubnetAutoAssignPublicIPDisabled',
    description: 'Ensures that subnets do not automatically assign public IPs.',
    priority: 2,
    priorityReason: 'Automatically assigning public IPs increases the attack surface of the VPC.',
    awsService: 'EC2',
    awsServiceCategory: 'Networking',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeSubnetsCommand',
        reason: 'Fetches details of all subnets to check the MapPublicIpOnLaunch attribute.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifySubnetAttributeCommand',
        reason: 'Disables the automatic assignment of public IPs for the specified subnets.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure there are no workloads depending on automatic public IP assignment in the affected subnets.',
  });

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];

    const response = await this.memoClient.send(new DescribeSubnetsCommand({}));
    const subnets = response.Subnets || [];

    for (const subnet of subnets) {
      if (subnet.MapPublicIpOnLaunch) {
        nonCompliantResources.push(subnet.SubnetId!);
      } else {
        compliantResources.push(subnet.SubnetId!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING';

    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      });
  };

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const subnetId of nonCompliantResources) {
      await this.client.send(
        new ModifySubnetAttributeCommand({
          SubnetId: subnetId,
          MapPublicIpOnLaunch: { Value: false },
        })
      );
    }
  };
}

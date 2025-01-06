import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import {
  SSMClient,
  DescribeInstanceInformationCommand,
} from '@aws-sdk/client-ssm';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class EC2InstanceManagedBySystemsManager implements BPSet {
  private readonly client = new EC2Client({});
  private readonly ssmClient = new SSMClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  public readonly getMetadata = () => ({
    name: 'EC2InstanceManagedBySystemsManager',
    description: 'Ensures that EC2 instances are managed by AWS Systems Manager.',
    priority: 2,
    priorityReason: 'Management through Systems Manager ensures efficient and secure configuration and operation of EC2 instances.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute', 
    bestPracticeCategory: 'Management and Governance',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInFixFunction: [],
    commandUsedInCheckFunction: [
      {
        name: 'DescribeInstancesCommand',
        reason: 'Retrieve the list of all EC2 instances.',
      },
      {
        name: 'DescribeInstanceInformationCommand',
        reason: 'Retrieve information about instances managed by Systems Manager.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure Systems Manager Agent (SSM Agent) is installed and configured properly on non-compliant instances.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const response = await this.memoClient.send(new DescribeInstancesCommand({}));
    const ssmResponse = await this.ssmClient.send(
      new DescribeInstanceInformationCommand({})
    );

    const managedInstanceIds = ssmResponse.InstanceInformationList?.map(
      (info) => info.InstanceId
    );

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'terminated')
          continue

        if (managedInstanceIds?.includes(instance.InstanceId!)) {
          compliantResources.push(instance.InstanceId!);
        } else {
          nonCompliantResources.push(instance.InstanceId!);
        }
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async () => {
    throw new Error(
      'Fix logic for EC2InstanceManagedBySystemsManager is not directly applicable. Systems Manager Agent setup requires manual intervention.'
    );
  };
}

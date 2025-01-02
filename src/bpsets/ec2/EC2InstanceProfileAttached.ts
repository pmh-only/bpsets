import {
  EC2Client,
  DescribeInstancesCommand,
  AssociateIamInstanceProfileCommand,
} from '@aws-sdk/client-ec2';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class EC2InstanceProfileAttached implements BPSet {
  private readonly client = new EC2Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  public readonly getMetadata = () => ({
    name: 'EC2InstanceProfileAttached',
    description: 'Ensures that all EC2 instances have an IAM instance profile attached.',
    priority: 2,
    priorityReason: 'Attaching an IAM instance profile enables instances to securely interact with AWS services.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'iam-instance-profile',
        description: 'The name of the IAM instance profile to attach.',
        default: '',
        example: 'EC2InstanceProfile',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeInstancesCommand',
        reason: 'Retrieve all EC2 instances and their associated IAM instance profiles.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'AssociateIamInstanceProfileCommand',
        reason: 'Attach an IAM instance profile to non-compliant EC2 instances.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure the specified IAM instance profile exists and aligns with your access control policies.',
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

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.IamInstanceProfile) {
          compliantResources.push(instance.InstanceId!);
        } else {
          nonCompliantResources.push(instance.InstanceId!);
        }
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const iamInstanceProfile = requiredParametersForFix.find(
      (param) => param.name === 'iam-instance-profile'
    )?.value;

    if (!iamInstanceProfile) {
      throw new Error("Required parameter 'iam-instance-profile' is missing.");
    }

    for (const instanceId of nonCompliantResources) {
      await this.client.send(
        new AssociateIamInstanceProfileCommand({
          InstanceId: instanceId,
          IamInstanceProfile: { Name: iamInstanceProfile },
        })
      );
    }
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from '../database/entities';

export interface IEntitlementService {
  canWatch(userId: string, videoId: string): Promise<boolean>;
}

@Injectable()
export class EntitlementService implements IEntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
  ) {}

  /**
   * Checks whether a user is entitled to stream a video.
   * Fail closed: returns false on any error or missing record.
   */
  async canWatch(userId: string, videoId: string): Promise<boolean> {
    if (!userId || !videoId) {
      this.logger.warn(`Entitlement check rejected: missing userId or videoId`);
      return false;
    }

    try {
      const purchase = await this.purchaseRepository.findOne({
        where: {
          userId,
          videoId,
          active: true,
        },
      });

      if (!purchase) {
        this.logger.debug(`No active purchase found for user ${userId} and video ${videoId}`);
        return false;
      }

      // Check expiration if set
      if (purchase.expiresAt && purchase.expiresAt.getTime() <= Date.now()) {
        this.logger.debug(`Purchase expired for user ${userId} and video ${videoId}`);
        return false;
      }

      return true;
    } catch (error) {
      // ASSUMPTION: Fail closed on any database/transient failure
      this.logger.error(`Entitlement check error for user ${userId}, video ${videoId}`, error);
      return false;
    }
  }
}

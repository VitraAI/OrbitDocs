import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

import { CreatePaymentDto, PAYMENT_REQUEST_TYPES } from './payment.dto';

const messages = (errors: ValidationError[]): string[] =>
  errors.flatMap((e) => [...Object.values(e.constraints ?? {}), ...messages(e.children ?? [])]);

/**
 * Validates the polymorphic payment body against the class its `type` names
 * (the global ValidationPipe cannot pick a class from a union).
 */
@Injectable()
export class PaymentRequestPipe implements PipeTransform<unknown, Promise<CreatePaymentDto>> {
  async transform(value: unknown): Promise<CreatePaymentDto> {
    const type = (value as { type?: unknown } | null)?.type;
    const cls = PAYMENT_REQUEST_TYPES[type as keyof typeof PAYMENT_REQUEST_TYPES];
    if (!cls) throw new BadRequestException([`type must be one of the following values: ${Object.keys(PAYMENT_REQUEST_TYPES).join(', ')}`]);
    const dto = plainToInstance(cls as ClassConstructor<CreatePaymentDto>, value as object);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length) throw new BadRequestException(messages(errors));
    return dto;
  }
}

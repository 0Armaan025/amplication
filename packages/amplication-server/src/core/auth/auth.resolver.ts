import { Resolver, Mutation, Query, Args } from '@nestjs/graphql';
import { UseGuards, UseFilters } from '@nestjs/common';
import { Auth, User, Account } from 'src/models';
import {
  LoginArgs,
  SignupArgs,
  ChangePasswordArgs,
  SetCurrentOrganizationArgs
} from './dto';

import { AuthService } from './auth.service';
import { GqlResolverExceptionsFilter } from 'src/filters/GqlResolverExceptions.filter';
import { UserEntity } from 'src/decorators/user.decorator';
import { GqlAuthGuard } from 'src/guards/gql-auth.guard';

@Resolver(() => Auth)
@UseFilters(GqlResolverExceptionsFilter)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  async me(@UserEntity() user: User): Promise<User> {
    return user;
  }

  @Mutation(() => Auth)
  async signup(@Args() args: SignupArgs): Promise<Auth> {
    const { data } = args;
    data.email = data.email.toLowerCase();
    const token = await this.authService.signup(data);
    return { token };
  }

  @Mutation(() => Auth)
  async login(@Args() args: LoginArgs): Promise<Auth> {
    const { email, password } = args.data;
    const token = await this.authService.login(email.toLowerCase(), password);
    return { token };
  }

  @Mutation(() => Account)
  @UseGuards(GqlAuthGuard)
  async changePassword(
    @UserEntity() user: User,
    @Args() args: ChangePasswordArgs
  ): Promise<Account> {
    return this.authService.changePassword(
      user.account,
      args.data.oldPassword,
      args.data.newPassword
    );
  }

  @Mutation(() => Auth)
  @UseGuards(GqlAuthGuard)
  async setCurrentOrganization(
    @UserEntity() user: User,
    @Args() args: SetCurrentOrganizationArgs
  ): Promise<Auth> {
    if (!user.account) {
      throw new Error('User has no account');
    }
    const token = await this.authService.setCurrentOrganization(
      user.account.id,
      args.data.id
    );
    return { token };
  }
}

import { Logger } from '@nestjs/common';

export class LdapQueryHandler {
  public static readonly LDAP_SEARCH_QUERY = (email) =>
    `(&(objectClass=person)(objectClass=user)(email=${email}))`;
  private static readonly LDAP_ERROR_RESPONSE = 'An error occurred while processing the LDAP query.';
  private static readonly PARSER: RegExp =
    /\(&\(objectClass=person\)\(objectClass=user\)\(email=(.*)\)\)/;

  private log: Logger = new Logger(LdapQueryHandler.name);

  public parseQuery(query: string): string {
    this.log.debug(`query: ${query}`);

    const res = query.match(LdapQueryHandler.PARSER);

    if (!res || res.length != 2 || !res[1]) {
      throw new Error(LdapQueryHandler.LDAP_ERROR_RESPONSE);
    } else {
      return res[1];
    }
  }
}

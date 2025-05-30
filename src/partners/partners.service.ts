import { Injectable, Logger } from '@nestjs/common';
import { DOMParser } from '@xmldom/xmldom';
import xpath, { SelectReturnType } from 'xpath';

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  private readonly XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
  private readonly XML_AUTHORS_STR: string = `${this.XML_HEADER}
    <partners>
      <partner>
        <name>Walter White</name>
        <age>50</age>
        <profession>Chemistry Teacher</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <username>walter100</username>
        <password>Heisenberg123</password>
        <wealth>15M USD</wealth>
      </partner>

      <partner>
        <name>Jesse Pinkman</name>
        <age>25</age>
        <profession>Professional Product Distributer</profession>
        <residency country="US" state="New Mexico" city="Yo Moma" />
        <username>dapinkman69</username>
        <password>Yoyo1!</password>
        <wealth>5M USD</wealth>
      </partner>

      <partner>
        <name>Michael Ehrmantraut</name>
        <age>65</age>
        <profession>Personal Security Agent</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <username>_safetyman_</username>
        <password>LittleKid777</password>
        <wealth>50M USD</wealth>
      </partner>

      <partner>
        <name>Gus Fring</name>
        <age>52</age>
        <profession>Restaurant Chain Owner</profession>
        <residency country="US" state="New Mexico" city="Albuquerque" />
        <username>ChickMan</username>
        <password>GoodChicken4U</password>
        <wealth>Too much USD</wealth>
      </partner>
    </partners>
  `;

  private getPartnersXMLObj(): Node {
    const partnersXMLObj = new DOMParser().parseFromString(
      this.XML_AUTHORS_STR,
      'text/xml'
    );
    return partnersXMLObj as unknown as Node;
  }

  private selectPartnerPropertiesByXPATH(
    xpathExpression: string
  ): SelectReturnType {
    const partnersXMLObj = this.getPartnersXMLObj();
    return xpath.select(xpathExpression, partnersXMLObj);
  }

  private getFormattedXMLOutput(xmlNodes): string {
    return `${this.XML_HEADER}\n<root>\n${xmlNodes.join('\n')}\n</root>`;
  }

  getPartnersProperties(xpathExpression: string): string {
    // Sanitize the input to prevent XPath Injection
    if (!this.isValidXPath(xpathExpression)) {
      throw new Error('Invalid XPath expression');
    }

    let xmlNodes = this.selectPartnerPropertiesByXPATH(xpathExpression);

    if (!Array.isArray(xmlNodes)) {
      this.logger.debug(
        `xmlNodes's type wasn't 'Array', and it's value was: ${xmlNodes}`
      );
      xmlNodes = [];
    } else {
      this.logger.debug(`Raw xpath xmlNodes value is: ${xmlNodes}`);
    }

    return this.getFormattedXMLOutput(xmlNodes);
  }

  private isValidXPath(xpathExpression: string): boolean {
    // Basic validation logic to ensure the XPath does not contain dangerous characters
    // This is a simple example and should be expanded based on the application's needs
    const forbiddenPatterns = [
      /\|\|/, // Disallow 'or' operator
      /\band\b/, // Disallow 'and' operator
      /\bnot\b/, // Disallow 'not' operator
      /\bdiv\b/, // Disallow 'div' operator
      /\bmod\b/, // Disallow 'mod' operator
      /\bunion\b/, // Disallow 'union' operator
      /\bintersect\b/, // Disallow 'intersect' operator
      /\bexcept\b/, // Disallow 'except' operator
      /\bpreceding\b/, // Disallow 'preceding' axis
      /\bfollowing\b/, // Disallow 'following' axis
      /\bancestor\b/, // Disallow 'ancestor' axis
      /\bdescendant\b/, // Disallow 'descendant' axis
      /\bself\b/, // Disallow 'self' axis
      /\bparent\b/, // Disallow 'parent' axis
      /\bchild\b/, // Disallow 'child' axis
      /\battribute\b/, // Disallow 'attribute' axis
      /\bnamespace\b/, // Disallow 'namespace' axis
      /\bprocessing-instruction\b/, // Disallow 'processing-instruction' function
      /\bcomment\b/, // Disallow 'comment' function
      /\btext\b/, // Disallow 'text' function
      /\bnode\b/, // Disallow 'node' function
      /\bdocument\b/, // Disallow 'document' function
      /\bkey\b/, // Disallow 'key' function
      /\bid\b/, // Disallow 'id' function
      /\bidref\b/, // Disallow 'idref' function
      /\blang\b/, // Disallow 'lang' function
      /\blocal-name\b/, // Disallow 'local-name' function
      /\bnamespace-uri\b/, // Disallow 'namespace-uri' function
      /\bname\b/, // Disallow 'name' function
      /\bnumber\b/, // Disallow 'number' function
      /\bstring\b/, // Disallow 'string' function
      /\bboolean\b/, // Disallow 'boolean' function
      /\btrue\b/, // Disallow 'true' function
      /\bfalse\b/, // Disallow 'false' function
      /\bnull\b/, // Disallow 'null' function
      /\bposition\b/, // Disallow 'position' function
      /\blast\b/, // Disallow 'last' function
      /\bcount\b/, // Disallow 'count' function
      /\bsum\b/, // Disallow 'sum' function
      /\bfloor\b/, // Disallow 'floor' function
      /\bceiling\b/, // Disallow 'ceiling' function
      /\bround\b/, // Disallow 'round' function
      /\bconcat\b/, // Disallow 'concat' function
      /\bstarts-with\b/, // Disallow 'starts-with' function
      /\bcontains\b/, // Disallow 'contains' function
      /\bsubstring-before\b/, // Disallow 'substring-before' function
      /\bsubstring-after\b/, // Disallow 'substring-after' function
      /\bsubstring\b/, // Disallow 'substring' function
      /\bstring-length\b/, // Disallow 'string-length' function
      /\bnormalize-space\b/, // Disallow 'normalize-space' function
      /\btranslate\b/, // Disallow 'translate' function
      /\bnot\b/, // Disallow 'not' function
      /\btrue\b/, // Disallow 'true' function
      /\bfalse\b/, // Disallow 'false' function
      /\bnull\b/, // Disallow 'null' function
      /\bposition\b/, // Disallow 'position' function
      /\blast\b/, // Disallow 'last' function
      /\bcount\b/, // Disallow 'count' function
      /\bsum\b/, // Disallow 'sum' function
      /\bfloor\b/, // Disallow 'floor' function
      /\bceiling\b/, // Disallow 'ceiling' function
      /\bround\b/, // Disallow 'round' function
      /\bconcat\b/, // Disallow 'concat' function
      /\bstarts-with\b/, // Disallow 'starts-with' function
      /\bcontains\b/, // Disallow 'contains' function
      /\bsubstring-before\b/, // Disallow 'substring-before' function
      /\bsubstring-after\b/, // Disallow 'substring-after' function
      /\bsubstring\b/, // Disallow 'substring' function
      /\bstring-length\b/, // Disallow 'string-length' function
      /\bnormalize-space\b/, // Disallow 'normalize-space' function
      /\btranslate\b/, // Disallow 'translate' function
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(xpathExpression)) {
        return false;
      }
    }

    return true;
  }
}

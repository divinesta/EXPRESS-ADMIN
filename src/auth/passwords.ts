import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const passwordPrefix = "scrypt";
const derivedKeyLength = 64;
const defaultParameters = { cost: 16_384, blockSize: 8, parallelism: 1 };
const maximumParameters = { cost: 131_072, blockSize: 16, parallelism: 4 };

type ScryptParameters = typeof defaultParameters;
type NodeScryptOptions = { N: number; r: number; p: number; maxmem: number };
type ScryptWithOptions = (
   password: string,
   salt: string,
   keylen: number,
   options: NodeScryptOptions,
   callback: (error: Error | null, derivedKey: Buffer) => void,
) => void;

function isValidCost(cost: number): boolean {
   return Number.isSafeInteger(cost) && cost >= 2 && cost <= maximumParameters.cost && (cost & (cost - 1)) === 0;
}

function parseStoredHash(storedHash: string): { salt: string; expected: Buffer; parameters: ScryptParameters } | null {
   const [prefix, costValue, blockSizeValue, parallelismValue, salt, expectedValue] = storedHash.split("$");
   if (prefix !== passwordPrefix || !costValue || !blockSizeValue || !parallelismValue || !salt || !expectedValue) return null;

   const parameters = { cost: Number(costValue), blockSize: Number(blockSizeValue), parallelism: Number(parallelismValue) };
   if (!isValidCost(parameters.cost)
      || !Number.isSafeInteger(parameters.blockSize)
      || parameters.blockSize < 1
      || parameters.blockSize > maximumParameters.blockSize
      || !Number.isSafeInteger(parameters.parallelism)
      || parameters.parallelism < 1
      || parameters.parallelism > maximumParameters.parallelism) return null;

   const expected = Buffer.from(expectedValue, "base64url");
   if (expected.length !== derivedKeyLength) return null;
   return { salt, expected, parameters };
}

async function derive(password: string, salt: string, parameters: ScryptParameters): Promise<Buffer> {
   const maxmem = (128 * parameters.cost * parameters.blockSize) + (128 * parameters.blockSize * parameters.parallelism) + 1_048_576;
   return new Promise((resolve, reject) => {
      const options = { N: parameters.cost, r: parameters.blockSize, p: parameters.parallelism, maxmem };
      const scryptWithOptions = scryptCallback as unknown as ScryptWithOptions;
      scryptWithOptions(password, salt, derivedKeyLength, options, (error, derivedKey) => {
         if (error) reject(error);
         else resolve(derivedKey);
      });
   });
}

export const hashAdminPassword = async (password: string): Promise<string> => {
   const salt = randomBytes(16).toString("base64url");
   const derived = await derive(password, salt, defaultParameters);
   return [passwordPrefix, defaultParameters.cost, defaultParameters.blockSize, defaultParameters.parallelism, salt, derived.toString("base64url")].join("$");
};

export const verifyAdminPassword = async (password: string, storedHash: string): Promise<boolean> => {
   const parsed = parseStoredHash(storedHash);
   if (!parsed) return false;
   const actual = await derive(password, parsed.salt, parsed.parameters);
   return timingSafeEqual(parsed.expected, actual);
};

const dummyHash = hashAdminPassword(randomBytes(32).toString("base64url"));

/** Always performs one password derivation, including when no account exists. */
export const verifyLoginPassword = async (password: string, storedHash?: string): Promise<boolean> => {
   return verifyAdminPassword(password, storedHash ?? await dummyHash);
};

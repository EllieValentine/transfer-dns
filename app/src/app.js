const readline = require("readline");
const axios = require("axios");
const { spawn } = require("child_process");

let API_KEY = null; // Will be recived from user

/**
 * Creates DNS record by sending POST request with
 * DigitalOcean access token.
 * {@link @link https://docs.digitalocean.com/reference/api/api-reference/#operation/create_domain_record API}.
 *
 * @param {object} obj
 * @param {string} obj.domain - Domain.
 * @param {object} obj.data - Payload.
 */
const createRecord = async ({ domain, data }) => {
  return await axios.post(
    `https://api.digitalocean.com/v2/domains/${domain}/records`,
    data,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  );
};

/**
 * Prints message to console.
 * @param {string} message - Message needs to show user.
 * @return {void}
 */
const print = (message) => console.log(">>\x1b[36m", message, "\x1b[0m");

/**
 * Validates and fixing TTL if needed.
 * DNS TTL (time to live) is a setting that tells the DNS resolver
 * how long to cache a query before requesting a new one.
 * @param {string} ttl - TTL record value.
 * @return {Number} Validated TTL value.
 */
const fixTTL = (ttl) => {
  if (Number(ttl) < 30) {
    print(`TTL has wrong value "${ttl}", will be set to 30`);
    return 30;
  }
  return ttl;
};

/**
 * Receives input from user.
 * @param {string} message - Question to user.
 * @return {Promise<string>} - User response.
 */
const question = (message) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    print(message);
    rl.question("", (value) => {
      resolve(value);
      rl.close();
    });
  });

/**
 * The main code of the app.
 * @return {Promise<void>}
 */
const app = async () => {
  let shellOutput = "";
  const allRecords = {};
  const willNotBeAdded = [];
  let totalRecords = 0;
  let totalValidRecords = 0;
  let totalNotValidRecords = 0;

  allRecords = { name2 };

  console.log("\nWelcome to the utility for transferring DNS records!\n");
  const DOMAIN = await question("Type domain");
  const NS = await question("Type NS");
  API_KEY = await question("Type DigitalOcean personal access token");

  print("Information provided");
  console.log(`Domain: ${DOMAIN}`, `\nNS: ${NS}`, `\nKEY: ${API_KEY}\n`);
  print(`Please wait...`);

  const ls = spawn("dig", [`@${NS}`, "axfr", `${DOMAIN}`]);

  /** Adds found record to global "allRecords" object */
  const addToScope = (type, source, valid, splitted) => {
    // If record valid increase valid counter otherwise invalid.
    valid ? ++totalValidRecords : ++totalNotValidRecords;
    // If type of the record is undefined creating an empty array
    if (!allRecords[type]) {
      allRecords[type] = [];
    }
    // Pushes the records
    allRecords[type].push({
      source,
      valid,
      splitted,
    });
  };

  /** Removes domain from parsed line */
  const removeDomain = (arr) => {
    arr[0] = arr[0].replace(`.${DOMAIN}.`, "");
    return arr;
  };

  /** Parses A record */
  const processA = (raw) => {
    const splitted = raw.split(/\s/);
    const valid = splitted.length === 5 && splitted[3] === "A";
    addToScope("A", raw, valid, removeDomain(splitted));
  };

  /** Parses CNAME record */
  const processCNAME = (raw) => {
    const splitted = raw.split(/\s/);
    const valid = splitted.length === 5 && splitted[3] === "CNAME";
    addToScope("CNAME", raw, valid, splitted);
  };

  /** Parses MX record */
  const processMX = (raw) => {
    const splitted = raw.split(/\s/);
    const valid = splitted.length === 6 && splitted[3] === "MX";
    addToScope("MX", raw, valid, removeDomain(splitted));
  };

  /** Parses TXT record */
  const processTXT = (raw) => {
    raw = raw.replace(/\s+/g, " ");
    const splitted = raw.split(/\s/);
    const matches = raw.match(/ IN TXT "(.+)"/);
    const valid =
      matches && matches[1] && splitted.length && splitted[3].length
        ? true
        : false;

    const data = [splitted[0], splitted[1], matches[1]];
    addToScope("TXT", raw, valid, removeDomain(data));
  };

  /** Parses SRV record */
  const processSRV = (raw) => {
    const splitted = raw.split(/\s/);
    const valid = splitted.length === 8 && splitted[3] === "SRV";
    addToScope("SRV", raw, valid, removeDomain(splitted));
  };

  /** Detects type of record */
  const typeSwitcher = (record) => {
    record = record.replace(/\s\s+/g, " ");
    if (record.includes(`\tA`) || record.includes(`IN A`)) {
      return processA(record);
    }
    if (record.includes(`\tCNAME`) || record.includes(`IN CNAME`)) {
      return processCNAME(record);
    }
    if (record.includes(`\tMX`) || record.includes(`IN MX`)) {
      return processMX(record);
    }
    if (record.includes(`\TXT`) || record.includes(`IN TXT`)) {
      return processTXT(record);
    }
    if (record.includes(`\SRV`) || record.includes(`IN SRV`)) {
      return processSRV(record);
    }
    willNotBeAdded.push(record.replace(/\s/g, " "));
  };

  /** Pushes A record to API */
  const pushARecord = async ({ splitted }) => {
    return await createRecord({
      domain: DOMAIN,
      data: {
        type: "A",
        name: splitted[0],
        data: splitted[4],
        priority: null,
        port: null,
        ttl: fixTTL(splitted[1]),
        weight: null,
        flags: null,
        tag: null,
      },
    });
  };

  /** Pushes TXT record to API */
  const pushTXTRecord = async ({ splitted }) => {
    return await createRecord({
      domain: DOMAIN,
      data: {
        type: "TXT",
        name: splitted[0],
        data: splitted[2],
        ttl: fixTTL(splitted[1]),
      },
    });
  };

  /** Pushes CNAME record to API */
  const pushCNAMERecord = async ({ splitted }) => {
    return await createRecord({
      domain: DOMAIN,
      data: {
        type: "CNAME",
        name: splitted[0],
        data: splitted[4],
        ttl: fixTTL(splitted[1]),
      },
    });
  };

  /** Pushes MX record to API */
  const pushMXRecord = async ({ splitted }) => {
    return await createRecord({
      domain: DOMAIN,
      data: {
        type: "MX",
        name: splitted[0],
        data: splitted[5],
        priority: splitted[4],
        ttl: fixTTL(splitted[1]),
      },
    });
  };

  /** Pushes SRV record to API */
  const pushSRVRecord = async ({ splitted }) => {
    return await createRecord({
      domain: DOMAIN,
      data: {
        type: "SRV",
        name: splitted[0],
        data: splitted[7],
        priority: splitted[4],
        port: splitted[6],
        ttl: fixTTL(splitted[1]),
        weight: splitted[5],
      },
    });
  };

  /**
   * Shows the user the results of processing
   * and asks if the data should be sent to DigitalOcean API
   */
  const sync = async () => {
    print(`Found records: ${totalRecords}`);
    print(`Valid records: ${totalValidRecords}`);
    print(`Not valid records: ${totalNotValidRecords}`);
    print("Record that will NOT be added:");
    willNotBeAdded.forEach((r, i) => console.log(`  ${i + 1}: ${r}`));

    const isYes = await question(
      "Print 'yes' to add all valid records to DigitalOcean"
    );

    if (isYes !== "yes") {
      print("Exit");
      return process.exit(1);
    }

    print("Please wait...");

    for (type of Object.keys(allRecords)) {
      if (allRecords[type]) {
        const records = allRecords[type];
        print(`Adding ${records.length} ${type} records...`);
        for (record of allRecords[type]) {
          if (!record.valid) {
            console.log(`Not valid, skip`);
            continue;
          }

          try {
            if (type === "A") await pushARecord(record);
            if (type === "TXT") await pushTXTRecord(record);
            if (type === "CNAME") await pushCNAMERecord(record);
            if (type === "MX") await pushMXRecord(record);
            if (type === "SRV") await pushSRVRecord(record);
            print(`Added: ${record.splitted[0]}`);
          } catch (e) {
            print(`ERROR!: The record not added`);
            console.log("Record:", record.source);
            console.log(e.response.data);
            if ("yes" !== (await question("Type yes to continue"))) {
              return process.exit(1);
            }
          }
        }
      }
    }

    console.log("\n\n");
    print(`Completed!`);
    console.log("\n\n");
  };

  ls.stdout.on("data", (chunk) => {
    const line = `${chunk}`;
    shellOutput += line;
  });

  ls.stdout.on("end", () => {
    const rawSplitted = shellOutput
      .split(/\n/)
      .filter((r) => r.indexOf(";") !== 0)
      .filter((r) => r.includes(DOMAIN));
    totalRecords = rawSplitted.length;
    rawSplitted.forEach((line) => typeSwitcher(line));
    sync();
  });
};

app();

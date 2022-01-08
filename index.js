var Firebird = require("node-firebird-dev"); // node-firebird contains a bug so cannot handle BLOBs
var ini = require("ini");
var util = require("util");
var mysql = require("mysql");
const fs = require("fs");

const logtimestamp = require("log-timestamp");

var config = ini.parse(fs.readFileSync("./config.ini", "utf-8"));

const paramDB = async (dbname, config) => {
  var options = {};
  options.database = await config[dbname].options.database;
  options.host = await config[dbname].options.host;
  options.port = await config[dbname].options.port;
  options.user = await config[dbname].options.user;
  options.password = await config[dbname].options.password;
  options.lowercase_keys = await config[dbname].options.lowercase_keys; // set to true to lowercase keys
  options.role = await config[dbname].options.role;
  options.pageSize = await config[dbname].options.pageSize; // default when creating database is 4096
  options.tables = await config[dbname].tables;
  options.dontmigrate = await config[dbname].dontmigrate;
  return options;
};

const mysqlParam = async () => {
  var mysqlParams = {};
  mysqlParams.host = await config.mysql.host;
  mysqlParams.port = await config.mysql.port;
  mysqlParams.database = await config.mysql.database;
  mysqlParams.user = await config.mysql.user;
  mysqlParams.password = await config.mysql.password;
  mysqlParams.connectionLimit = await config.mysql.connectionLimit;
  mysqlParams.acquireTimeout = await config.mysql.acquireTimeout;
  mysqlParams.multipleStatements = true;
  return mysqlParams;
};

queryDB = async (options, tablename) => {
  return new Promise((resolve, reject) => {
    var sql = "";
    var create = "";
    var insert = "";
    var fieldName = "";
    var fieldTypeOrigin = "";
    var fieldType = "";
    var isDate = false;
    var isBlob = false;
    var fieldToBeSkipped = false;
    var fieldLength = 0;
    var fieldSubType = "";
    var indexArray = [];
    var indexName = "";
    var indexPos = 0;
    var blobArray = [];
    var fieldIndex = 0;

    Firebird.attach(options, function (err, db) {
      if (err) reject(error);
      // db.query("select t.rdb$type_name TYPE, rf.rdb$field_name FIELD from RDB$relation_fields rf, rdb$fields f, rdb$types t where rf.rdb$relation_name = '" + tablename +"' and rf.rdb$field_source=f.rdb$field_name and t.rdb$field_name= 'RDB$FIELD_TYPE' and f.rdb$field_type=t.rdb$type and t.rdb$type_name <> 'BLOB'",
      db.query(
        "select t.rdb$type_name TYPE, rf.rdb$field_name FIELD, f.rdb$field_length LENGTH, st.rdb$type_name SUBTYPE, max(INDEXNAME) INDEXNAME, min(POS) POS  " +
          "from rdb$fields f, rdb$types t, rdb$types st, " +
          "RDB$relation_fields rf left join (select se.rdb$field_name SE_FIELD, i.rdb$relation_name I_RELATION, i.rdb$index_name INDEXNAME, se.rdb$field_position POS " +
          "from rdb$indices i, rdb$index_segments se " +
          "where i.rdb$index_name=se.rdb$index_name) " +
          "on I_RELATION=rf.rdb$relation_name and SE_FIELD=rf.rdb$field_name " +
          "where rf.rdb$relation_name = '" +
          tablename +
          "' and rf.rdb$field_source=f.rdb$field_name and t.rdb$field_name= 'RDB$FIELD_TYPE' " +
          "and f.rdb$field_type=t.rdb$type " +
          "and f.rdb$field_sub_type = st.rdb$type and st.rdb$field_name= 'RDB$FIELD_SUB_TYPE' " +
          "group by TYPE, FIELD, LENGTH, SUBTYPE",
        function (err, result) {
          if (err) reject(err);

          sql = " ";
          create = "CREATE TABLE IF NOT EXISTS " + tablename + " (";
          insert = "INSERT INTO " + tablename + " (";
          result.forEach(function (rows, index) {
            var size = Object.keys(result).length;
            for (let [key, value] of Object.entries(rows)) {
              if (key.trim() === "TYPE") {
                fieldTypeOrigin = value.trim();
              } else if (key.trim() === "LENGTH") {
                fieldLength = value;
              } else if (key.trim() === "SUBTYPE") {
                fieldSubType = value.trim();
              } else if (key.trim() === "FIELD") {
                fieldName = value.trim();
              } else if (key.trim() === "INDEXNAME") {
                if (value) {
                  indexName = value.trim();
                }
              } else if (key.trim() === "POS") {
                indexPos = value;
              }
            }
            if (fieldTypeOrigin === "VARYING") {
              fieldType = "VARCHAR(" + fieldLength + ")";
            } else if (fieldTypeOrigin === "TEXT") {
              fieldType = "CHAR(" + fieldLength + ")";
            } else if (fieldTypeOrigin === "SHORT") {
              fieldType = "INTEGER";
            } else if (fieldTypeOrigin === "INT64") {
              fieldType = "INTEGER";
            } else if (fieldTypeOrigin === "LONG") {
              fieldType = "INTEGER";
            } else if (
              fieldTypeOrigin === "DATE" ||
              fieldTypeOrigin === "TIMESTAMP"
            ) {
              fieldType = "DATE";
              isDate = true;
            } else if (fieldTypeOrigin === "BLOB" && fieldSubType === "TEXT") {
              fieldType = "MEDIUMTEXT";
              isBlob = true;
            } else if (fieldTypeOrigin === "BLOB" && fieldSubType !== "TEXT") {
              fieldType = "";
              isBlob = false;
              fieldToBeSkipped = true;
            } else {
              fieldType = fieldTypeOrigin;
            }
            if (options.dontmigrate) {
              if (options.dontmigrate[tablename]) {
                for (const [table, value] of Object.entries(
                  options.dontmigrate[tablename]
                )) {
                  if (table === fieldName) {
                    fieldToBeSkipped = true;
                  }
                }
              }
            }

            if (!fieldToBeSkipped) {
              if (isDate) {
                sql =
                  sql +
                  "CAST(LPAD(EXTRACT(YEAR FROM " +
                  fieldName +
                  " ),4,'0')||'-'||LPAD(EXTRACT(MONTH FROM " +
                  fieldName +
                  " ),2,'0')||'-'||LPAD(EXTRACT(DAY FROM " +
                  fieldName +
                  "),2,'0') as varchar(30)) " +
                  fieldName +
                  " ";
              } else if (isBlob) {
                sql = `${sql} ${fieldName} AS ${fieldName} `;
                blobArray.push(fieldName);
                blobArray[fieldName] = index; // to put field index into the array;
              } else {
                sql = sql + fieldName;
              }
              insert = insert + fieldName;
              create = create + fieldName + " " + fieldType + " NULL";
              if (index < size - 1) {
                sql = sql + ", ";
                insert = insert + ", ";
                create = create + ", ";
              }
              // Puts index info into indexArray
              if (indexName) {
                if (!indexArray[indexName]) {
                  indexArray.push(indexName);
                  indexArray[indexName] = [];
                }
                indexArray[indexName].splice(indexPos, 0, fieldName);
              }
            } else {
              if (index === size - 1) {
                sql = sql.slice(0, -2);
                insert = insert.slice(0, -2);
                create = create.slice(0, -2);
              }
            }
            fieldToBeSkipped = false;
            fieldName = "";
            fieldTypeOrigin = "";
            fieldType = "";
            isDate = false;
            isBlob = false;
            fieldLength = 0;
            fieldSubType = "";
            indexName = "";
            pos = 0;
          });
          sql = sql + " FROM " + tablename;
          insert = insert + " ) VALUES  ? ";
          create = create + ");";

          db.detach();
          result = [];
          result["options"] = options;
          result["sql"] = sql;
          result["tablename"] = tablename;
          result["insert"] = insert;
          result["create"] = create;
          result["indexArray"] = indexArray;
          result["blobArray"] = blobArray;
          resolve(result);
        }
      );
    });
  });
};

createArray = async (result) => {
  return new Promise((resolve, reject) => {
    try {
      insertArray = [];
      if (result) {
        result.forEach(function (rows, index) {
          insertA = [];
          for (let [key, value] of Object.entries(rows)) {
            if (
              value === null ||
              value !== value ||
              typeof value === "undefined"
            ) {
              insertA.push(value);
            } else {
              insertA.push(value.toString().trim());
            }
          }
          insertArray.push(insertA);
        });
      }
      resolve(insertArray);
    } catch (error) {
      if (error) reject(error);
    }
  });
};

mysqlGetConnection = (pool) => {
  return new Promise((resolve, reject) => {
    pool.getConnection(function (err, connection) {
      if (err) {
        return reject(err);
      }
      resolve(connection);
    });
  });
};

mysqlExecute = async (command, pool) => {
  return new Promise((resolve, reject) => {
    (async () => {
      const connection = await mysqlGetConnection(pool);
      const query = util.promisify(connection.query).bind(connection);
      (async () => {
        try {
          var result = await query(command);
        } catch (err) {
          reject(err);
        }
        resolve(result);
        connection.release();
      })();
    })();
  });
};

mysqlInsert = async (insert, data, pool) => {
  return new Promise((resolve, reject) => {
    (async () => {
      const connection = await mysqlGetConnection(pool);
      const query = util.promisify(connection.query).bind(connection);
      (async () => {
        try {
          var result = await query(insert, [data]);
        } catch (err) {
          reject(err);
        }
        resolve(result);
        connection.release();
      })();
    })();
  });
};

mysqlQuery = async (data, pool) => {
  return new Promise((resolve, reject) => {
    try {
      (async () => {
        const connection = await mysqlGetConnection(pool);
        const query = util.promisify(connection.query).bind(connection);
        (async () => {
          try {
            var result = await query(data);
          } catch (err) {
            reject(err);
          }
          resolve(result);
          connection.release();
        })();
      })();
    } catch (err) {
      reject(err);
    }
  });
};

fbQuery = async (options, statement, blobArray) => {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, function (err, db) {
      try {
        db.query(statement, function (error, result) {
          if (error) reject(error);
          db.detach();
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  });
};

fbQueryStream = async (options, statement, blobArray) => {
  var outputArray = [];

  return new Promise((resolve, reject) => {
    Firebird.attach(options, function (err, db) {
      try {
        db.query(statement, function (error, result) {
          if (blobArray && result) {
            outputArray.push(result);
            result.forEach(function (rows, index) {
              var buf = Buffer.from("");
              blobArray.forEach(function (fields, ind) {
                fieldName = fields;
                blobFieldindex = blobArray[fieldName];
                if (rows[fieldName]) {
                  buf = Buffer.from(rows[fieldName]);
                }
                outputArray[0][index][fieldName] = buf.toString();
              });
            });
          }
          resolve(outputArray);
          db.detach();
        });
      } catch (error) {
        db.detach();
        reject(error);
      }
    });
  });
};

insertDB = async (
  options,
  sql,
  tablename,
  insert,
  create,
  indexArray,
  blobArray,
  pool,
  rows_count
) => {
  var tablesize = 0;
  var inserted = 0;

  let result = await fbQuery(options, "select count(*) from " + tablename, []);

  result.forEach(function (rows, index) {
    tablesize = Object.values(rows)[0];
  });
  console.log(
    `Export STARTED for table: ${tablename} Count of rows: ${tablesize} \r\n`
  );
  let exec = await mysqlExecute(
    "drop table if exists " + tablename + ";",
    pool
  );
  exec = await mysqlExecute(create + ";", pool);

  for (let i = 0; i < tablesize; i += rows_count) {
    sqlseq = "SELECT FIRST " + rows_count + " SKIP " + i + "  " + sql;
    if (blobArray.length !== 0) {
      result = await fbQueryStream(options, sqlseq, blobArray);
      result = result[0];
    } else {
      result = await fbQuery(options, sqlseq);
    }
    const dataArray = await createArray(result);
    if (dataArray) {
      const res = await mysqlInsert(insert, dataArray, pool);
      inserted += res.affectedRows;
    }
    console.log(
      `Rows inserted into ${tablename} : ${inserted}/${tablesize} \r\n`
    );
  }
  console.log(
    `Export FINISHED for table: ${tablename} Count of rows: ${tablesize} \r\n`
  );
  if (indexArray) {
    let statement = await createIndex(tablename, indexArray, pool);
    exec = await mysqlExecute(statement, pool);
    console.log(
      `Number of indexes created for ${tablename} : ${exec.length} \r\n`
    );
  }
};

createIndex = async (tablename, indexArray, pool) => {
  return new Promise((resolve) => {
    var indexName = "";
    var index_statement = "CREATE INDEX ";
    var statement = "";
    indexArray.forEach(function (rows, index) {
      indexName = rows;
      let arr = indexArray;
      statement =
        statement + index_statement + indexName + " ON " + tablename + " (";
      indexArray[indexName].forEach(function (row, ind) {
        statement = statement + row;
        if (ind < indexArray[indexName].length - 1) {
          statement = statement + ",";
        } else {
          statement = statement + "); \r\n";
        }
      });
    });
    resolve(statement);
  });
};

const iterate = async function () {
  var mysqlParams = await mysqlParam();
  const pool = mysql.createPool(mysqlParams);

  const rows_count = +(await config.mysql.rows_count);

  for (const [key, dbname] of Object.entries(config.database.db)) {
    var options = await paramDB(dbname, config);
    var tables = options.tables;

    for (const [table, value] of Object.entries(tables)) {
      let arr = await this.queryDB(options, table);
      await this.insertDB(
        arr.options,
        arr.sql,
        arr.tablename,
        arr.insert,
        arr.create,
        arr.indexArray,
        arr.blobArray,
        pool,
        rows_count
      );
    }
  }
  console.log(`Export DONE \r\n`);
  pool.end(function (err) {
    if (err) throw err;
    process.exit();
  });
  process.exit();
};

iterate();

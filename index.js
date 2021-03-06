var Firebird = require('node-firebird');
var ini = require('ini');
var util = require('util');
var mysql = require('mysql');
const fs = require('fs');

const logtimestamp = require('log-timestamp');

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

// Reads Firebird DB params from config.ini

const paramDB = async (dbname, config) => {
    var options = {};
    options.database = await config[dbname].options.database;
    options.host = await config[dbname].options.host;
    options.port = await config[dbname].options.port;
    options.user = await config[dbname].options.user;
    options.password = await config[dbname].options.password;
    options.lowercase_keys = await config[dbname].options.lowercase_keys; // set to true to lowercase keys
    options.role = await config[dbname].options.role;           
    options.pageSize = await config[dbname].options.pageSize;        // default when creating database is 4096
    options.tables = await config[dbname].tables;
    options.dontmigrate = await config[dbname].dontmigrate;
    return options;
}

// Read MySQL params from config.ini

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
}

// Generate SELECT statement from Firebird, and CREATE TABLE, INSERT and CREATE INDEX for MySQL

queryDB = async(options, tablename) => {
    return new Promise((resolve, reject)=> {
        var sql = '';
        var create = '';
        var insert = '';
        var fieldName = '';
        var fieldTypeOrigin = '';
        var fieldType = '';
        var isDate = false;
        var isBlob = false;
        var fieldToBeSkipped = false;
        var fieldLength = 0;
        var fieldSubType = '';
        var indexArray = [];
        var indexName = '';
        var indexPos = 0;

        Firebird.attach(options, function(err, db) {
            if (err)
                throw err; 

            // Query fields of a Table from Firebird including Index information
            db.query("select t.rdb$type_name TYPE, rf.rdb$field_name FIELD, f.rdb$field_length LENGTH, st.rdb$type_name SUBTYPE, max(INDEXNAME) INDEXNAME, min(POS) POS  " +
                     "from rdb$fields f, rdb$types t, rdb$types st, " +
                     "RDB$relation_fields rf left join (select se.rdb$field_name SE_FIELD, i.rdb$relation_name I_RELATION, i.rdb$index_name INDEXNAME, se.rdb$field_position POS " +
                        "from rdb$indices i, rdb$index_segments se " +
                        "where i.rdb$index_name=se.rdb$index_name) " +
                        "on I_RELATION=rf.rdb$relation_name and SE_FIELD=rf.rdb$field_name " + 
                     "where rf.rdb$relation_name = '" + tablename +"' and rf.rdb$field_source=f.rdb$field_name and t.rdb$field_name= 'RDB$FIELD_TYPE' " +
                     "and f.rdb$field_type=t.rdb$type " +
                     "and f.rdb$field_sub_type = st.rdb$type and st.rdb$field_name= 'RDB$FIELD_SUB_TYPE' " +
                     "group by TYPE, FIELD, LENGTH, SUBTYPE",   
            function(err, result) {
                if (err)
                    reject(err); 

                sql = ' ';
                create = 'CREATE TABLE IF NOT EXISTS '+tablename+' (';
                insert = 'INSERT INTO '+tablename+' (';
                result.forEach( function(rows, index) {

                    // Iterate through every fields in a row of Table definition FIELDs

                    var size = Object.keys(result).length;
                    for (let [key, value] of Object.entries(rows)) {
                        if (key.trim()==='TYPE') {
                            fieldTypeOrigin = value.trim();
                        } else if (key.trim()==='LENGTH') {
                            fieldLength=value;
                        } else if (key.trim()==='SUBTYPE') {
                            fieldSubType=value.trim();
                        } else if (key.trim()==='FIELD') {
                            fieldName=value.trim();
                        } else if (key.trim()==='INDEXNAME') {
                            if (value) {
                                indexName=value.trim();
                            }
                        } else if (key.trim()==='POS') {
                                indexPos=value;
                        }
                    }

                    // Set matching data types for MySQL based on what is set in Firebird

                    if (fieldTypeOrigin==='VARYING') {
                        fieldType = 'VARCHAR('+fieldLength+')';
                    } else if (fieldTypeOrigin==='TEXT') {
                        fieldType = 'CHAR('+fieldLength+')';
                    } else if (fieldTypeOrigin==='SHORT') {
                        fieldType = 'INTEGER';
                    } else if (fieldTypeOrigin==='INT64') {
                        fieldType = 'INTEGER';
                    } else if (fieldTypeOrigin==='LONG') {
                        fieldType = 'INTEGER';
                    } else if (fieldTypeOrigin==='DATE' || fieldTypeOrigin==='TIMESTAMP') {
                        fieldType = 'DATE';
                        isDate = true;
                    } else if (fieldTypeOrigin==='BLOB' && fieldSubType==='TEXT' ) {
                        fieldType = 'TEXT';
                        isBlob = true;
                    } else if (fieldTypeOrigin==='BLOB' && fieldSubType!=='TEXT' ) {
                        fieldType = '';
                        isBlob = false;
                        fieldToBeSkipped = true;
                    } else { 
                        fieldType = fieldTypeOrigin; 
                    }

                    // Evaluates DATABASE.donotmigrate.TABLE entries in config.ini
                    if (options.dontmigrate) {
                        if (options.dontmigrate[tablename]) {
                            for (const [table, value] of Object.entries(options.dontmigrate[tablename])) {
                                if (table === fieldName) {
                                    fieldToBeSkipped=true;
                                }
                            }
                        }
                    }

                    if (!fieldToBeSkipped) {
                        if (isDate) {
                            // Date conversion in order to match to the target system -- might needs to be adjusted in other regional settings!!!!
                            sql = sql + "CAST(LPAD(EXTRACT(YEAR FROM " + fieldName + " ),4,'0')||'-'||LPAD(EXTRACT(MONTH FROM " + fieldName + " ),2,'0')||'-'||LPAD(EXTRACT(DAY FROM " + fieldName + "),2,'0') as varchar(30)) " + fieldName + " "; 
                        } else if (isBlob) {
                            // sql = sql + "CAST("+ fieldName + " AS VARCHAR(32000) character set octets) " + fieldName + " ";
                            sql = `${sql}BLOBTOTEXT(${fieldName}) ${fieldName} `;
                        } else {
                            sql=sql+fieldName; 
                        }

                        // Adds fields to statements
                        insert=insert+fieldName; 
                        create = create + fieldName + ' ' + fieldType + ' NULL';
                        if(index<size-1) {
                            sql=sql+', ';
                            insert=insert+', ';
                            create=create + ', ';
                        }
                        // Puts index info into indexArray
                        if (indexName) {
                            if (!indexArray[indexName]) {
                                indexArray.push(indexName);
                                indexArray[indexName]=[];
                            }
                            indexArray[indexName].splice(indexPos, 0, fieldName);
                        }
                    } else {
                        // Remove training ', ' from strings if this is the last entry 
                        if(index===size-1) {
                            sql = sql.slice(0, -2);
                            insert = insert.slice(0, -2);
                            create = create.slice(0, -2);
                        }
                    }
                    fieldToBeSkipped = false;
                    fieldName = '';
                    fieldTypeOrigin = '';
                    fieldType = '';
                    isDate = false;
                    isBlob = false;
                    fieldLength = 0;
                    fieldSubType = '';
                    indexName = '';
                    pos = 0;
                });

                // Closing statements
                sql=sql+" FROM " + tablename ;
                insert=insert+' ) VALUES  ? ';
                create = create + ');';

                db.detach();

                // Generate resultset as array (Promise has only one result)
                result = [];
                result['options']=options;
                result['sql']=sql;
                result['tablename']=tablename;
                result['insert']=insert;
                result['create']=create;
                result['indexArray']=indexArray;
                resolve(result);
                })  
            })
    });
}

// Generates array from data to be imported

createArray = async (result) => {
    return new Promise((resolve) => {
        insertArray = [];
        result.forEach( function(rows, index) {
            insertA=[];
            for (let [key, value] of Object.entries(rows)) {
                if (value===null || value !== value  || typeof value === "undefined") {
                    insertA.push(value);
                } else {             
                    insertA.push(value.toString().trim());
                } 
            }
            insertArray.push(insertA);
        });
        resolve(insertArray);
    });
}

// Reserve a connection from pool

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

// Execute statements in MySQL - always generates a result

mysqlExecute = async (command, pool) => {
    return new Promise((resolve, reject) => {
        (async () => {
            const connection  = await mysqlGetConnection(pool); 
            const query = util.promisify(connection.query).bind(connection);
            (async () => {
                try {
                    var  result = await query(command);
                }  catch ( err ) {
                   reject(err);
                }
                resolve(result);
                connection.release(); 
            })()  
        })()           
    });
}

// Insert data into MySQL

mysqlInsert = async (insert, data, pool) => {
    return new Promise((resolve, reject) => {
        (async () => {
            const connection  = await mysqlGetConnection(pool); 
            const query = util.promisify(connection.query).bind(connection);
            (async () => {
                try {
                    var  result = await query(insert, [data]);
                }  catch ( err ) {
                    throw err;
                    reject(err);
                }
                resolve(result);
                connection.release(); 
            })()
 
        })()    
    });
}

//Runs Firebird statements

fbQuery = async (options, statement) => {
    return new Promise((resolve, reject) => {
        try {
            Firebird.attach(options, function(err, db) {
                try {
                    db.execute(statement, function(error, result) {
                        if (error)
                            reject(error);
                        resolve(result);
                        db.detach();
                    });
                }  catch ( err ) {
                    reject(err);
                }
            });
        }  catch ( err ) {
            reject(err);
        }
    });
}

// Exports data from Firebird databases and imports into MySQL

exportImport = async (options, sql, tablename, insert, create, indexArray, pool, rows_count) => {

    var tablesize = 0;
    var inserted = 0;
    
    let result = await fbQuery(options, 'select count(*) from '+tablename);    
    result.forEach( function(rows, index) {
        tablesize=Object.values(rows)[0];
    });
    console.log(`Export STARTED for table: ${tablename} Count of rows: ${tablesize}`);
    // Drop and recreate table
    let exec = await mysqlExecute('drop table if exists '+ tablename+';', pool);
    exec = await mysqlExecute(create+';', pool);

    for (let i = 1; i<tablesize; i+=rows_count) {
        // Select Rows from Firebird
        sqlseq='SELECT FIRST '+rows_count+' SKIP '+(i-1)+' '+sql;

        result = await fbQuery(options, sqlseq);

        // Insert Rows into MySQL
        const dataArray = await createArray(result);
        if (dataArray) {
            const res = await mysqlInsert(insert, dataArray, pool);
            inserted += res.affectedRows;
        }
        console.log(`Rows inserted into ${tablename} : ${inserted}/${tablesize}`);
    }
    console.log(`Export FINISHED for table: ${tablename} Count of rows: ${tablesize}`);

    // Create INDEX 
    if (indexArray) {
        let statement = await createIndex(tablename, indexArray, pool);
        exec = await mysqlExecute(statement, pool);
        if (exec.length) {
            console.log(`Number of index created for ${tablename} : ${exec.length}`);
        } else {
            console.log(`Number of index created for ${tablename} : 1`);
        }
    }
}

// Generate CREATE INDEX statements into one string
createIndex = async (tablename, indexArray, pool) => {
    return new Promise((resolve) => {
        var indexName = '';
        var index_statement = "CREATE INDEX ";
        var statement = '';
        indexArray.forEach( function(rows, index) {
            indexName=rows;
            let arr=indexArray;
            statement = statement + index_statement + indexName +" ON "+tablename +" (";
            indexArray[indexName].forEach(function(row, ind) {
                    statement=statement+row;
                    if (ind<indexArray[indexName].length-1) {
                        statement = statement + ",";
                    } else {
                        statement = statement + "); \r\n";
                    }
            })    
        })
        resolve(statement);  
    })
}

const iterate = async function () {

    var mysqlParams = await mysqlParam();
    const pool = mysql.createPool(mysqlParams);

    const rows_count = +(await config.mysql.rows_count);

    // Iterate through all Firebird databases defined in config.ini
    for (const [key, dbname] of Object.entries(config.database.db)) {
        var options = await paramDB(dbname, config);
        var tables = options.tables;

        // Iterate through all tables of a Firebird database defined in config.ini
        for (const [table, value] of Object.entries(tables)) {
            // Generate statements and call export-import data
            let arr = await this.queryDB(options, table);
            await this.exportImport(arr.options, arr.sql, arr.tablename, arr.insert, arr.create, arr.indexArray, pool, rows_count);
        }
    }
    pool.end(function(err) {
          if (err) throw err;
    }); 
}

iterate();


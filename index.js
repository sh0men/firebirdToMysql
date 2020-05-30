var Firebird = require('node-firebird');
var ini = require('ini');
var util = require('util');
var mysql = require('mysql');
const fs = require('fs');
// const { parse } = require('fast-csv');

const logtimestamp = require('log-timestamp');

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

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
    return options;
}

const mysqlParam = async () => {
    var mysqlParams = {};
    mysqlParams.host = await config.mysql.host;
    mysqlParams.port = await config.mysql.port;
    mysqlParams.database = await config.mysql.database;
    mysqlParams.user = await config.mysql.user;
    mysqlParams.password = await config.mysql.password;
    mysqlParams.connectionLimit = await config.mysql.connectionLimit;
    mysqlParams.acquireTimeout = await config.mysql.acquireTimeout;
    return mysqlParams;
}

queryDB = async(options, tablename) => {
    return new Promise((resolve, reject)=> {
        var sql = '';
        var create = '';
        var insert = '';
        var i = 0;
        var fieldType = '';
        var isDate = false;

        Firebird.attach(options, function(err, db) {
            if (err)
                throw err; 
            db.query("select t.rdb$type_name TYPE, rf.rdb$field_name FIELD from RDB$relation_fields rf, rdb$fields f, rdb$types t where rf.rdb$relation_name = '" + tablename +"' and rf.rdb$field_source=f.rdb$field_name and t.rdb$field_name= 'RDB$FIELD_TYPE' and f.rdb$field_type=t.rdb$type and t.rdb$type_name <> 'BLOB'", 
            function(err, result) {
                if (err)
                    reject(err); 

                sql = ' ';
                create = 'CREATE TABLE IF NOT EXISTS '+tablename+' (';
                insert = 'INSERT INTO '+tablename+' (';
                result.forEach( function(rows, index) {

                    var size = Object.keys(result).length;
                    for (let [key, value] of Object.entries(rows)) {
                            
                            if (key.trim()==='TYPE') {
                                if (value.trim()==='VARYING') {
                                    fieldType = 'VARCHAR(1000)';
                                } else if (value.trim()==='SHORT') {
                                    fieldType = 'INTEGER';
                                } else if (value.trim()==='INT64') {
                                    fieldType = 'INTEGER';
                                } else if (value.trim()==='LONG') {
                                    fieldType = 'INTEGER';
                                } else if (value.trim()==='DATE' || value.trim()==='TIMESTAMP') {
                                    fieldType = 'DATE';
                                    isDate = true;
                                } else { 
                                    fieldType = value.trim(); 
                                }
                            } else {
                                if (isDate) {
                                    sql = sql + "CAST(LPAD( EXTRACT( YEAR FROM " + value.trim() + " ), 4, '0' ) ||'-' || LPAD( EXTRACT( MONTH FROM " + value.trim() + " ), 2, '0' ) ||'-' || LPAD( EXTRACT( DAY FROM " + value.trim() + " ), 2, '0' )   as varchar(30)) " + value.trim() + " "; 
                                } else {
                                    sql=sql+value.trim(); 
                                }
                                insert=insert+value.trim(); 
                                create = create + value.trim() + ' ' + fieldType + ' NULL';
                                if(index<size-1) {
                                    sql=sql+', ';
                                    insert=insert+', ';
                                    create=create + ', ';
                                } else {
                                    create = create + ');';
                                }
                                isDate = false;
                            }
                    }
                });
                sql=sql+" FROM " + tablename ;
                insert=insert+' ) VALUES  ? ';
                db.detach();
                result = [];
                result['options']=options;
                result['sql']=sql;
                result['tablename']=tablename;
                result['insert']=insert;
                result['create']=create;
                resolve(result);
                })  
            })
    });
}

createArray = async (result) => {
    return new Promise((resolve) => {
        insertArray = [];
        result.forEach( function(rows, index) {
            insertA=[];
            for (let [key, value] of Object.entries(rows)) {
                if (value===null || value !== value) {
                    insertA.push(value);
                } else {
                    insertA.push(value.toString().trim().replace('„', '').replace('”', '')); 
                }
            }
            insertArray.push(insertA);
        });
        resolve(insertArray);
    });
}

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
            const connection  = await mysqlGetConnection(pool); 
            const query = util.promisify(connection.query).bind(connection);
            (async () => {
                try {
                    var  result = await query(command);
                }  catch ( err ) {
                   reject(err);
                }
                resolve(true);
                connection.release(); 
            })()  
        })()           
    });
}

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

mysqlQuery = async (data, pool) => {
    return new Promise((resolve, reject) => {
        (async () => {
            const connection  = await mysqlGetConnection(pool); 
            const query = util.promisify(connection.query).bind(connection);
            (async () => {
                try {
                   var result = await query(data);
                }  catch ( err ) {
                    reject(err);
                }
                resolve(result);
                connection.release(); 
            })()   
        })()     
    });
}

fbQuery = async (options, statement) => {
    return new Promise((resolve, reject) => {
        try {
            Firebird.attach(options, function(err, db) {
                if (err)
                    reject(err); 
                db.query(statement, function(err, result) {
                    if (err)
                        reject(err);
                    resolve(result);
                    db.detach();
                });
            });
        }  catch ( err ) {
            reject(err);
        }
    });
}

insertDBWithoutBlob = async (options, sql, tablename, insert, create, pool, rows_count) => {

    var tablesize = 0;
    var inserted = 0;
    
    let result = await fbQuery(options, 'select count(*) from '+tablename);    
    result.forEach( function(rows, index) {
        tablesize=Object.values(rows)[0];
    });
    console.log(`Export STARTED for table: ${tablename} Count of rows: ${tablesize}`);
    let exec = await mysqlExecute('drop table if exists '+ tablename+';', pool);
    exec = await mysqlExecute(create+';', pool);

    for (let i = 1; i<tablesize; i+=rows_count) {
        sqlseq='SELECT FIRST '+rows_count+' SKIP '+(i-1)+' '+sql;

        result = await fbQuery(options, sqlseq);

        const dataArray = await createArray(result);
        if (dataArray) {
            const res = await mysqlInsert(insert, dataArray, pool);
            inserted += res.affectedRows;
        }
        console.log(`Rows inserted into ${tablename} : ${inserted}/${tablesize}`);
    }
    console.log(`Export FINISHED for table: ${tablename} Count of rows: ${tablesize}`);
}

const iterate = async function () {

    var mysqlParams = await mysqlParam();
    const pool = mysql.createPool(mysqlParams);

    const rows_count = +(await config.mysql.rows_count);

    for (const [key, dbname] of Object.entries(config.database.db)) {
        var options = await paramDB(dbname, config);
        var tables = options.tables;

        for (const [table, value] of Object.entries(tables)) {
            let arr = await this.queryDB(options, table);
            await this.insertDBWithoutBlob(arr.options, arr.sql, arr.tablename, arr.insert, arr.create, pool, rows_count);
        }
    }
    pool.end(function(err) {
          if (err) throw err;
    }); 
}

iterate();


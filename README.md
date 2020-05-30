# firebirdToMysql
Automated Table exports from multiple FireBird databases into a Mysql database

###
Firebird 3.0 Support
Firebird new wire protocol is not supported yet so for Firebird 3.0 you need to add the following in firebird.conf

AuthServer = Legacy_Auth
WireCrypt = Disabled

###
BLOB fields not supported!

###
Usage:

Just rename the config_sample.ini and fill in the config parameters
By copying DBNAMEx.options and DBNAMEx.table sections you can export from as many databases as possible until the table names are not identhical, since only one mysql database can be used at the moment.

###
TAGs:
Easier access to Firebird table data since ODBC drivers are sometimes unstable.

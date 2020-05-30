# firebirdToMysql
Automated Table exports from multiple FireBird databases into a Mysql database

###
Firebird 3.0 Support
Firebird new wire protocol is not supported yet so for Firebird 3.0 you need to add the following in firebird.conf

AuthServer = Legacy_Auth
WireCrypt = Disabled

###
BLOB fields not supported!

const Ftp = require('ftp');

class AwaitableFtpClient extends Ftp{

    putAwait(input, destPath, zcomp = false){
        return new Promise( (resolve,reject) =>{
            this.put(input, destPath, zcomp = false, err =>{
                if ( err ){
                    reject(err);
                    return;
                }
                resolve(true);
            });
        });
    }

    listAwait(path, zcomp = false){
        return new Promise( (resolve, reject) =>{
            this.list( path, zcomp, (err, list) =>{
                if ( err ){
                    reject(err);
                    return;
                }
                resolve(list);
            });
        });
    }

    mkdirAwait( path, recursive = false ){
        return new Promise( (resolve,reject) =>{
            this.mkdir( path, recursive , err =>{
                if ( err ){
                    reject( err );
                }

                resolve(true);
            });
        });
    }

    deleteAwait(path, ignoreError = false){

        return new Promise( (resolve, reject) =>{
            this.delete( path, function(err){

                if ( ignoreError ){
                    resolve(0);
                    return;
                }

                if ( err ){
                    reject(err);
                    return;
                }

                resolve(1);
            });
        });
    }

    /**
     * @description 覆盖/创建文件, 如果路径不存在创建目标路径
     * @param {string|Buffer} input 
     * 上传内容
     * @param {string} destPath
     * 目标路径
     * 
     * @return {err|void}
     */
    putOrMkdir( input, destPath ){

        return new Promise( async (resolve, reject) =>{
            const pathToCheck = destPath.replace(/^(.+)\/([^/]+)$/, '$1');
            try {
                const foundList = await this.listAwait( pathToCheck );
   
                if ( foundList.length === 0 ){
                    await this.mkdirAwait( pathToCheck, true );
                }
                
                await this.putAwait(input, destPath);
    
                resolve(true);

            }catch( e ){
                reject(e);
            }
        });

    }

    putOrMkdirMultiple( inputs ){
        return new Promise( (resolve, reject) => {
            let existingPath = {};
            let checkingPaths = [], creatingPromises = [], uploadPromises = [];

            if ( !Array.isArray( inputs ) || typeof inputs[0] === 'undefined' ){
                resolve( 0 );
            }
        
            inputs.forEach( input => {
                const { data, destPath } = input;
                const isDir = /^(.+)\/([^/]+)$/.test( destPath );

                if ( !isDir ){
                    return;
                }

                const pathToCheck = destPath.replace(/^(.+)\/([^/]+)$/, '$1');
    
                if ( typeof existingPath[pathToCheck] === 'undefined' ){
                    existingPath[pathToCheck] = true;
                    checkingPaths.push(pathToCheck);
                }
     
                uploadPromises.push(
                    this.putAwait( data, destPath )
                );
            });

            Promise
            .all(checkingPaths.map( p => this.listAwait( p ) ) )
            .then( async lists => {

                lists.forEach( (list, index) => {
                    if ( list.length === 0 ){
                        creatingPromises.push(
                            this.mkdirAwait( checkingPaths[index], true )
                        );
                    }
                });

                if ( !!creatingPromises[0] ){
                    await Promise.all( creatingPromises );
                }

                return Promise.all( uploadPromises );
            }, rejected =>{
                reject(rejected);
            })
            .then( () => {
                resolve(inputs.length);
            }, rejected =>{
                reject(rejected);
            })
            .catch( rejected =>{
                reject( rejected );
            });
        });
    }

    /**
     * 
     * @param {String} path 
     * @param {Boolean} recursive 
     * 
     * @return {Promise}
     */
    rmdirAwait( path, recursive = false ){
        return new Promise( (resolve, reject) => {

            this.list( path, (err, list) => {
                if ( err ){
                    reject(err);
                    return;
                }

                const listLength= list.length;
                if ( listLength === 0 ){
                    resolve(0);
                    return;
                }

                this.rmdir( path, recursive, _err =>{
                    if ( _err ){
                        reject(_err);
                        return;
                    }

                    resolve( listLength );
                }); 
            });
        });
    }

}

const ftpClient = new AwaitableFtpClient();

module.exports = params =>{
    
    return new Promise( (resolve, reject) =>{

        ftpClient.on('ready', err =>{

            if ( err ){
                resolve(err.code);
                return;
            }

            ftpClient.list('/', err => {

                if ( err ){
                    reject(err);
                    return;
                }

                resolve(ftpClient);
            });

            resolve(ftpClient);
        });

        ftpClient.on('error', err =>{
            switch ( err.code ){
                case 'ECONNREFUSED':
                    reject(`FTP连接错误: ${err.code}}`);
                    break;
                case 530:
                    reject('FTP连接错误: 账号或密码出错');
                    break;
                default:
                    reject(`FTP连接错误: ${err.code}`);
            }
        });

        ftpClient.connect(params);
    });
};
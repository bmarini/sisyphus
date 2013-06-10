/**
 * Plugin developed to save html forms data to LocalStorage to restore them after browser crashes, tabs closings
 * and other disasters.
 *
 * @author Alexander Kaupanin <kaupanin@gmail.com>
 * @version 1.1
 */

( function( $ ) {
  $.fn.sisyphus = function( options ) {
    $( this ).each(function() {
      var sis = $(this).data( 'sisyphus' )

      if ( sis ) {
        return sis;
      } else {
        sis = Sisyphus.init(this);
        sis.setInitialOptions();
        sis.protect( options );
        $(this).data( 'sisyphus', sis)

        return sis;
      }
    });
  };

  var browserStorage = {};

  /**
   * Check if local storage or other browser storage is available
   *
   * @return Boolean
   */
  browserStorage.isAvailable = function() {
    if ( typeof $.jStorage === "object" ) {
      return true;
    }
    try {
      return localStorage.getItem;
    } catch ( e ) {
      return false;
    }
  };

  /**
   * Set data to browser storage
   *
   * @param [String] key
   * @param [String] value
   *
   * @return Boolean
   */
  browserStorage.set = function( key, value ) {
    if ( typeof $.jStorage === "object" ) {
      $.jStorage.set( key, value + "" );
    } else {
      try {
        localStorage.setItem( key, value + "" );
      } catch ( e ) {
        //QUOTA_EXCEEDED_ERR
      }
    }
  };

  /**
   * Get data from browser storage by specified key
   *
   * @param [String] key
   *
   * @return string
   */
  browserStorage.get = function( key ) {
    if ( typeof $.jStorage === "object" ) {
      var result = $.jStorage.get( key );
      return result ? result.toString() : result;
    } else {
      return localStorage.getItem( key );
    }
  };

  /**
   * Delete data from browser storage by specified key
   *
   * @param [String] key
   *
   * @return void
   */
  browserStorage.remove = function( key ) {
    if ( typeof $.jStorage === "object" ) {
      $.jStorage.deleteKey( key );
    } else {
      localStorage.removeItem( key );
    }
  };

  Sisyphus = ( function() {

    function init (form) {
      var instantiated = false;
      var started = false;
      var self;

      return {
        /**
         * Set plugin initial options
         *
         * @param [Object] options
         *
         * @return void
         */
        setInitialOptions: function ( options ) {
          self = this;

          var defaults = {
            excludeFields: [],
            customKeyPrefix: "",
            locationBased: false,
            timeout: 0,
            autoRelease: true,
            onSave: function() {},
            onBeforeRestore: function() {},
            onRestore: function() {},
            onRelease: function() {}
          };
          this.options = this.options || $.extend( defaults, options );
          this.browserStorage = browserStorage;
        },

        /**
         * Set plugin options
         *
         * @param [Object] options
         *
         * @return void
         */
        setOptions: function ( options ) {
          this.options = this.options || this.setInitialOptions( options );
          this.options = $.extend( this.options, options );
        },

        /**
         * Protect specified forms, store it's fields data to local storage and restore them on page load
         *
         * @param Object options      plugin options
         *
         * @return void
         */
        protect: function( options ) {
          this.setOptions( options );
          this.href = location.hostname + location.pathname + location.search + location.hash;

          if ( ! this.browserStorage.isAvailable() ) {
            return false;
          }

          var callback_result = self.options.onBeforeRestore.call( self );
          if ( callback_result === undefined || callback_result ) {
            self.restoreAllData();
          }

          if ( this.options.autoRelease ) {
            self.bindReleaseData();
          }

          if ( ! started ) {
            self.bindSaveData();
            started = true;
          }
        },

        /**
         * Bind saving data
         *
         * @return void
         */
        bindSaveData: function() {
          if ( self.options.timeout ) {
            self.saveDataByTimeout();
          }

          self.fieldsToProtect().each( function() {
            if ( $.inArray( this, self.options.excludeFields ) !== -1 ) {
              // Returning non-false is the same as a continue statement in a for loop; it will skip immediately to the next iteration.
              return true;
            }
            var field = $( this );
            var key = self.storageKey( field );

            if ( field.is( ":text" ) || field.is( "textarea" ) ) {
              if ( ! self.options.timeout ) {
                self.bindSaveDataImmediately( field, key );
              }
            }
            self.bindSaveDataOnChange( field );
          } );
        },

        /**
         * Save all protected forms data to Local Storage.
         * Common method, necessary to not lead astray user firing 'data is saved' when select/checkbox/radio
         * is changed and saved, while textfield data is saved only by timeout
         *
         * @return void
         */
        saveAllData: function() {
          self.fieldsToProtect().each( function() {
            var field = $( this );
            if ( $.inArray( this, self.options.excludeFields ) !== -1 || field.attr( "name" ) === undefined ) {
              // Returning non-false is the same as a continue statement in a for loop; it will skip immediately to the next iteration.
              return true;
            }
            var key = self.storageKey( field );
            var value = field.val();

            if ( field.is(":checkbox") ) {
              if ( field.attr( "name" ).indexOf( "[" ) !== -1 ) {
                value = [];
                $( "[name='" + field.attr( "name" ) +"']:checked" ).each( function() {
                  value.push( $( this ).val() );
                } );
              } else {
                value = field.is( ":checked" );
              }
              self.saveToBrowserStorage( key, value, false );
            } else if ( field.is( ":radio" ) ) {
              if ( field.is( ":checked" ) ) {
                value = field.val();
                self.saveToBrowserStorage( key, value, false );
              }
            } else {
              self.saveToBrowserStorage( key, value, false );
            }
          } );

          self.options.onSave.call();
        },

        /**
         * Restore forms data from Local Storage
         *
         * @return void
         */
        restoreAllData: function() {
          var restored = false;

          self.fieldsToProtect().each( function() {
            if ( $.inArray( this, self.options.excludeFields ) !== -1 ) {
              // Returning non-false is the same as a continue statement in a for loop; it will skip immediately to the next iteration.
              return true;
            }
            var field = $( this );
            var resque = self.browserStorage.get( self.storageKey( field ) );
            if ( resque ) {
              self.restoreFieldsData( field, resque );
              restored = true;
            }
          } );

          if ( restored ) {
            self.options.onRestore.call();
          }
        },

        /**
         * Restore form field data from local storage
         *
         * @param Object field    jQuery form element object
         * @param String resque   previously stored fields data
         *
         * @return void
         */
        restoreFieldsData: function( field, resque ) {
          if ( field.attr( "name" ) === undefined ) {
            return false;
          }
          if ( field.is( ":checkbox" ) && resque !== "false" && field.attr( "name" ).indexOf( "[" ) === -1 ) {
            field.attr( "checked", "checked" );
          } else if( field.is( ":checkbox" ) && resque === "false" && field.attr( "name" ).indexOf( "[" ) === -1 ) {
            field.removeAttr( "checked" );
          } else if ( field.is( ":radio" ) ) {
            if ( field.val() === resque ) {
              field.attr( "checked", "checked" );
            }
          } else if ( field.attr( "name" ).indexOf( "[" ) === -1 ) {
            field.val( resque );
          } else {
            resque = resque.split( "," );
            field.val( resque );
          }
        },

        /**
         * Bind immediate saving (on typing/checking/changing) field data to local storage when user fills it
         *
         * @param Object field    jQuery form element object
         * @param String key      key to store data in local storage
         *
         * @return void
         */
        bindSaveDataImmediately: function( field, key ) {
          if ( 'onpropertychange' in field ) {
            field.get(0).onpropertychange = function() {
              self.saveToBrowserStorage( key, field.val() );
            };
          } else {
            field.get(0).oninput = function() {
              self.saveToBrowserStorage( key, field.val() );
            };
          }
        },

        /**
         * Save data to Local Storage and fire callback if defined
         *
         * @param String key
         * @param String value
         * @param Boolean [true] fireCallback
         *
         * @return void
         */
        saveToBrowserStorage: function( key, value, fireCallback ) {
          // if fireCallback is undefined it should be true
          fireCallback = fireCallback === undefined ? true : fireCallback;
          this.browserStorage.set( key, value );
          if ( fireCallback && value !== "" ) {
            this.options.onSave.call();
          }
        },

        /**
         * Bind saving field data on change
         *
         * @param Object field    jQuery form element object
         *
         * @return void
         */
        bindSaveDataOnChange: function( field ) {
          field.change( self.saveAllData );
        },

        /**
         * Saving (by timeout) field data to local storage when user fills it
         *
         * @return void
         */
        saveDataByTimeout: function() {
          var targetForms = self;
          setTimeout( ( function( targetForms ) {
            function timeout() {
              self.saveAllData();
              setTimeout( timeout, self.options.timeout * 1000 );
            }
            return timeout;
          } )( targetForms ), self.options.timeout * 1000 );
        },

        /**
         * Bind release form fields data from local storage on submit/reset form
         *
         * @return void
         */
        bindReleaseData: function() {
          $( form ).bind( "submit reset", self.releaseData );
        },

        /**
         * Manually release form fields
         *
         * @return void
         */
        manuallyReleaseData: function() {
          self.releaseData( );
        },

        /**
         * Bind release form fields data from local storage on submit/resett form
         *
         * @return void
         */
        releaseData: function() {
          var released = false;

          self.fieldsToProtect().each( function() {
            if ( $.inArray( this, self.options.excludeFields ) !== -1 ) {
              // Returning non-false is the same as a continue statement in a for loop;
              // it will skip immediately to the next iteration.
              return true;
            }

            var field = $( this );
            self.browserStorage.remove( self.storageKey( field ) );
            released = true;
          } );

          if ( released ) {
            self.options.onRelease.call();
          }
        },

        fieldsToProtect: function() {
          return $(form).find( ":input" ).not( ":submit" ).not( ":reset" ).not( ":button" ).not( ":file" ).not( ":password" );
        },

        storageKey: function( field ) {
          return ( self.options.locationBased ? self.href : "" ) +
            self.targetFormIdAndName() +
            field.attr( "name" ) +
            self.options.customKeyPrefix;
        },

        targetFormIdAndName: function() {
          return $( form ).attr( "id" ) + $( form ).attr( "name" );
        }
      };
    }

    return {
      init : init
    };

  } )();
} )( jQuery );

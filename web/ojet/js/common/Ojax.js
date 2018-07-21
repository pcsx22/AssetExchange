/*global define, alert, _BM_CSRF_TOKEN */

define([
    'jquery',
    'libs/underscore',
    'require',
    'i18n!locales/generalUserMessagesText'
], function($, _, require, text) {
    /**
     * Creates an Ojax instance that can be used to make server calls.
     *
     * This constructor takes a baseUrl that will be prepended to all ojax calls
     *
     * Options - Can be overridden for all calls when creating the Ojax object, or on a per call basis
     *     - pageMask: Boolean, default: true
     *         - whether to display the pageMask during the call
     *     - pageMaskMessage: String, default: null
     *         - message to display in the page mask
     *     - fullEndpoint: Boolean, default: false
     *         - whether the endpoint is a fully qualified URL and baseUrl should be ignored. Differs
     *             from sending a blank baseUrl in that it doesn't force a '/' at the beginning
     *     - timeout: Number, default: 60
     *         - Number of seconds to wait before timing out
     *     - retryAfterTimeout: Number or Boolean, default: 3
     *         - Whether to retry the call after a timeout. If true, retries once. If a number, retries the
     *             given number of times
     *     - retryDelay: Number, default: 30
     *         - Number of seconds to wait between retries
     *     - isHighPriority: Boolean, default: false
     *         - Adds the call to the top of the list.
     *     - data: JSON data, default: null
     *         - Data to send along with an ajax call
     *     - formData: FormData object, default: null
     *         - FormData object to send, useful for file upload
     *     - done: Function, default: does nothing
     *         - Handler to call after the ajax call completes successfully
     *     - fail: Function, default: alerts error
     *         - Handler to call after the ajax call fails to complete
     *     - timeoutRetry: Function, default: does nothing
     *         - Handler to call if the ajax call fails due to timeout, called instead of fail while
     *             retrying the call.
     *     - always: Function, default: does nothing
     *         - Handler to call after the ajax call no matter what
     *
     *
     * Example Usage:
     *
     *      var server = new Ojax('/base/path', {
     *          pageMask: false
     *      });
     *
     *      server.update('/components/'+id, {
     *          data: component,
     *          done: function(returnData) {
     *              // handle returnData
     *          }
     *      });
     *
     * @param {String} baseUrl The baseUrl to be prepended to every call
     * @param {[type]} options [description]
     */
    var Ojax = function(baseUrl, options) {
        this.baseUrl = baseUrl;

        this.options = _.defaults({}, options, this.defaultOptions);
    },

        MAX_AJAX_CALL_COUNT = 10,
        cache = false,
        ajaxQueue = [],
        waitQueueCounter = 0;

    _.extend(Ojax.prototype, {

        /**
         * Default options
         */
        defaultOptions: {
            pageMask: true,
            pageMaskMessage: null,
            timeout: 0,
            retryAfterTimeout: 3,
            retryDelay: 30,
            data: null,
            formData: null,
            isHighPriority: false,

            /**
             * Call success.
             *
             * @param {Object} data     The server response
             * @param {String} status   The server status
             * @param {jqXHR} jqXHR     The jqXHR object (contains response, headers, etc)
             */
            done: function(/*data, status, jqXHR*/) {
                // Do nothing
            },

            /**
             * Call fail. If retryAfterTimeout is enabled, this will only be called after the final
             * failure, when all retries have been exhausted. timeoutRetry is called in the meantime.
             *
             * @param {jqXHR} jqXHR         The jqXHR object (contains response, headers, etc)
             * @param {String} status       The server status (e.g. 'error', 'timeout')
             * @param {String} errorThrown  The error thrown as a string (e.g. "Internal Server Error")
             */
            fail: function(jqXHR, status, errorThrown) {
                alert(errorThrown);
            },

            /**
             * Call failed with timeout, call is being retried.
             * Only called if retryAfterTimeout is enabled.
             * Same parameters as fail.
             */
            timeoutRetry: function(/*jqXHR, status, errorThrown*/) {
                // Do nothing
            },

            /**
             * Always called after success or fail.
             */
            always: function() {
                // Optional.
            }

        },

        /**
         * Overrides default options and/or options set in constructor.
         */
        setOptions: function(options) {
            this.options = _.defaults({}, options, this.options);
        },

        /**
         * Initiates a GET call
         */
        get: function(endpoint, options) {
            return this.serverCall('GET', endpoint, options);
        },

        /**
         * Initiates a HEAD call
         */
        head: function(endpoint, options) {
            return this.serverCall('HEAD', endpoint, options);
        },

        /**
         * Initiates a POST call
         */
        post: function(endpoint, options) {
            return this.serverCall('POST', endpoint, options);
        },

        /**
         * Initiates a PUT call
         */
        put: function(endpoint, options) {
            return this.serverCall('PUT', endpoint, options);
        },

        /**
         * Initiates a DELETE call
         */
        delete: function(endpoint, options) {
            return this.serverCall('DELETE', endpoint, options);
        },


        /**
         * Initiates a sync action.
         * Wraps the data passed via options in the appropriate data wrapper, appends the correct
         * action to the URL, and issues the POST call
         */
        sync: function(endpoint, options) {
            endpoint += '/actions/synchronize';
            var data = {
                _client_driven_action: true,
                documents: options.data
            };
            options.data = data;
            return this.serverCall('POST', endpoint, options);
        },

        /**
         * Initiates a server call using the given method and endpoint, using the options
         *
         * @param  {String} method   Type of server call (e.g. POST, GET)
         * @param  {[type]} endpoint Partial URL to attach to baseUrl
         * @param  {[type]} options  Options to override default options
         */
        serverCall: function(method, endpoint, options) {
            // Override default options
            options = _.defaults({}, options, this.options);

            // Show mask if necessary
            if (options.pageMask) showPageMask(options.pageMaskMessage);

            // Get options for ajax call
            var ajaxOptions = this.getAjaxOptions(method, endpoint, options);

            addToAjaxQueue(ajaxOptions, this, options, method, endpoint);
        },

        /**
         * Processes method, endpoint, and url into an ajaxOptions object for use
         * with $.ajax
         * Exposed externally to simulate the ajax options without actually making
         * an ajax call (in cases when making ajax calls using a different method)
         * @param  {String} method   POST, GET, etc...
         * @param  {String} endpoint Url (relative to baseUrl)
         * @param  {Object} options  Additional options
         * @return {Object}          Ajax options
         */
        getAjaxOptions: function(method, endpoint, options) {
            // Create ajax options
            var ajaxOptions = {
                type: method,
                url: options.fullEndpoint ? endpoint : fullPath(this.baseUrl, endpoint),
                contentType: "application/json",
                dataType: options.dataType || 'json',
                timeout: options.timeout * 1000,
                cache: cache,
                headers: { "X-Cpq-Csrf-Token": _BM_CSRF_TOKEN }
            };

            // If GET, allow jquery to convert to a querystring, otherwise, preserve JSON data by using stringify
            if (/GET/i.test(method)) {
                ajaxOptions.data = options.data;
            } else if (options.data) {
                // Don't want to stringify 'null'
                ajaxOptions.data = JSON.stringify(options.data);
            } else if (options.formData) {
                // Send formData raw and without contentType
                ajaxOptions.data = options.formData;
                ajaxOptions.processData = false;
                ajaxOptions.contentType = false;
            }

            return ajaxOptions;
        },

        /**
         * Clears and aborts existing queue for all instances of Ojax.
         */
        clearQueue: function() {
            ajaxQueue = [];
        },

        /**
         * Cancel the retry attempt
         */
        cancelRetry: cancelRetry

    });

    // PageMask options
    var PageMask;
    var pageMaskOn = false;
    var retryPageMaskOn = false;
    var retryTimer;


    /**
     * Concatenates baseUrl and endpoint, ensuring they are separated by a slash and
     * removes any extraneous slashes between them
     */
    function fullPath(baseUrl, endpoint) {
        var url = baseUrl.replace(/\/$/, '');
        if (typeof endpoint === 'number') endpoint = endpoint.toString();
        if (!_.isUndefined(endpoint) && endpoint.length) {
            url += '/' + endpoint.replace(/^\//, '');
        }
        return  url;
    }

    /**
     * Shows the page mask. If PageMask is not defined, retrieves the PageMask library
     */
    function showPageMask(message) {
        if (PageMask) {
            PageMask.on(message);
        } else {
            // pageMaskOn use: require may be slower than the AJAX response.
            pageMaskOn = true;
            require(['common/PageMask'], function(PM) {
                PageMask = PM;
                if (pageMaskOn) {
                    PageMask.on(message);
                }
            });
        }
    }

    /**
     * Hides the page mask, unless it is being used by retry
     */
    function hidePageMask() {
        if(!retryPageMaskOn) {
            pageMaskOn = false;
            if (PageMask){
               PageMask.off();
            }
        }
    }

    /**
     * Built in done call. Currently just calls the done handler defined in options
     *
     * @param {Object}  options     Options object
     * @param {Object}  data        The server response
     * @param {String}  status      The server status
     * @param {jqXHR}   jqXHR       The jqXHR object (contains response, headers, etc)
     */
    function done(options, data, status, jqXHR) {
        options.done(data, status, jqXHR);
    }

    /**
     * Built in fail call that checks the response for a ojax response JSON object, and
     * if it exists, replaces the standard 'errorThrown' parameter with the error sent
     * by the server when calling the custom fail callback.
     *
     * In the future if we want to customize 'errorThrown' for different error statuses,
     * we could do it here
     *
     * If retry is enabled, retries the original call
     *
     * @param  {String} method      Method used to make the original call
     * @param  {String} endpoint    Endpoint used in the original call
     * @param  {Object} options     Options object
     * @param  {jqXHR}  jqXHR       The jqXHR object
     * @param  {String} status      Status of server (type of error thrown)
     * @param  {String} errorThrown The error thrown as a string
     */
    function fail(method, endpoint, options, jqXHR, status, errorThrown) {
        var rspJ = jqXHR.responseJSON;
        if (rspJ) {
            if (rspJ.error) {
                errorThrown = rspJ.error;
            } else if (rspJ.title) {
                var ed = rspJ['o:errorDetails'];
                errorThrown = rspJ.title;
                if (ed && ed.length) {
                    ed.forEach(function(item, index){
                        errorThrown += '\n' + item.title;
                    });
                }
            }
        } else if (jqXHR.responseText) {
            errorThrown = jqXHR.responseText;
        }

        errorThrown = errorThrown || text.unknownError;

        if (status == 'timeout' && options.retryAfterTimeout) {
            // Attempt retry if timed out
            options.timeoutRetry(jqXHR, status, errorThrown);
            retry(this, method, endpoint, options);
        } else {
            options.fail(jqXHR, status, errorThrown, {method: method, endpoint: endpoint, options: options});
            if (options.rej)
                options.rej();

        }
    }


    /**
     * Built in always call that removes the pagemask if configured, then calls the
     * custom always callback
     *
     * @param {Object} options The options object
     */
    function always(options) {
        if (options.pageMask) hidePageMask();
        options.always();
        clear1WaitQueue();
    }

    /**
     * Retries the original ajax call
     * @param  {Ojax} ojax   The Ojax object used to make the call
     * @param  {String} method   Method from the original call
     * @param  {String} endpoint Endpoint from the original call
     * @param  {Object} options  Options for the call (modified to reduce the retries)
     */
    function retry(ojax, method, endpoint, options) {
        if (options.retryAfterTimeout) {

            // Decrease the number of times to retry
            if (!_.isNumber(options.retryAfterTimeout)) options.retryAfterTimeout = 1;
            options.retryAfterTimeout--;

            // Update the page mask if necessary
            if (options.pageMask) {
                retryPageMaskOn = true;
                displayCountdown(options.retryAfterTimeout, options.retryDelay);
            }

            // Retry the original call after retryDelay seconds
            retryTimer = _.delay(function() {
                retryPageMaskOn = false;
                ojax.serverCall(method, endpoint, options);
            }, options.retryDelay * 1000);
        }
    }

    /**
     * Cancels the retry attempt
     */
    function cancelRetry() {
        clearTimeout(retryTimer);
        retryPageMaskOn = false;
        hidePageMask();
    }

    /**
     * Counts down the displayed message on page mask.
     *
     * @param {integer} retries
     * @param {integer} seconds
     */
    function displayCountdown(retries, seconds){
        if (seconds > 0){
            if (PageMask) {
                PageMask.updateMessage(text.connectionError + ' ' + text.retrying + fillString('.', retries + 1) +
                        seconds.toString());
            }

            _.delay(displayCountdown, 1000, retries, seconds - 1);
        }
    }

    /**
     * Creates a string filled with given string concatenated length times.
     * This should move to a string utils module.
     *
     * @param {String} s
     * @param {integer} length
     *
     * @return {String}
     */
    function fillString(s, length){
        var s_new = '', i;

        for (i=0; i < length; i++) {
            s_new += s;
        }

        return s_new;
    }

    /**
     * Adds AJAX call to queue and calls the AJAX method.
     *
     * @param ajaxOptions
     * @param self
     * @param options
     * @param method
     * @param endpoint
     */
    function addToAjaxQueue(ajaxOptions, self, options, method, endpoint) {
        var qModel = {
            ajaxOptions: ajaxOptions,
            self: self,
            options: options,
            method: method,
            endpoint: endpoint
        };

        if (!options.isHighPriority)
            ajaxQueue.push(qModel);
        else
            ajaxQueue.unshift(qModel);

        makeQueAjaxCall();
    }

    /**
     * Makes the AJAX call if current call count is less than max count.
     */
    function makeQueAjaxCall() {
        var a;

        if (waitQueueCounter < MAX_AJAX_CALL_COUNT && ajaxQueue.length) {
            waitQueueCounter++;
            a = ajaxQueue.shift();

            // Make ajax call
            $.ajax(a.ajaxOptions)
                .done(_.bind(done, a.self, a.options))
                .fail(_.bind(fail, a.self, a.method, a.endpoint, a.options))
                .always(_.bind(always, a.self, a.options));
        }
    }

    /**
     * This method is called on AJAX response.
     * Decrements counter and calls the AJAX method.
     */
    function clear1WaitQueue() {
        _.defer(function(){
            waitQueueCounter--;
            makeQueAjaxCall();
        });
    }

    return Ojax;
});


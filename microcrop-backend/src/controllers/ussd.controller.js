import ussdService from '../services/ussd.service.js';

export const ussdController = {
  async handleUssd(req, res, next) {
    try {
      const { sessionId, serviceCode, phoneNumber, text } = req.body;
      const result = await ussdService.handleRequest(sessionId, serviceCode, phoneNumber, text);
      res.set('Content-Type', 'text/plain');
      res.send(result);
    } catch (error) {
      next(error);
    }
  },
};

export default ussdController;
